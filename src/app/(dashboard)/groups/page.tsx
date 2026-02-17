'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Group, Hotel, HotelWithScores, ChannelScores, Channel, GroupWithStats } from '@/lib/types';
import { calculateWeightedAverage, formatScore, getScoreColor } from '@/lib/scoring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  Hotel as HotelIcon,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupWithStats[]>([]);
  const [hotels, setHotels] = useState<HotelWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedHotelIds, setSelectedHotelIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load groups
    const { data: groupsData } = await supabase
      .from('groups')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    // Load hotels
    const { data: hotelsData } = await supabase
      .from('hotels')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    // Load group-hotel memberships
    const { data: groupHotels } = await supabase
      .from('group_hotels')
      .select('*');

    // Load latest snapshots
    const hotelIds = (hotelsData || []).map((h) => h.id);
    const { data: snapshots } = await supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds.length > 0 ? hotelIds : ['none'])
      .order('fetched_at', { ascending: false });

    // Build hotel scores map
    const hotelsWithScores: HotelWithScores[] = (hotelsData || []).map((hotel) => {
      const hotelSnapshots = (snapshots || []).filter((s) => s.hotel_id === hotel.id);
      const scores: ChannelScores = { google: null, tripadvisor: null, expedia: null, booking: null, airbnb: null };

      const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];
      for (const ch of channels) {
        const latest = hotelSnapshots.find((s) => s.channel === ch);
        if (latest) {
          scores[ch] = {
            average_score: latest.average_score,
            normalized_score: latest.normalized_score,
            total_reviews: latest.total_reviews,
            fetched_at: latest.fetched_at,
          };
        }
      }

      return { ...hotel, scores, weighted_average: calculateWeightedAverage(scores) };
    });

    setHotels(hotelsWithScores);

    // Build groups with stats
    const groupsWithStats: GroupWithStats[] = (groupsData || []).map((group) => {
      const memberIds = (groupHotels || [])
        .filter((gh) => gh.group_id === group.id)
        .map((gh) => gh.hotel_id);

      const memberHotels = hotelsWithScores.filter((h) => memberIds.includes(h.id));
      const hotelsWithAvg = memberHotels.filter((h) => h.weighted_average !== null);

      const groupAvg =
        hotelsWithAvg.length > 0
          ? hotelsWithAvg.reduce((sum, h) => sum + (h.weighted_average || 0), 0) / hotelsWithAvg.length
          : null;

      return {
        ...group,
        hotel_count: memberIds.length,
        weighted_average: groupAvg,
        hotels: memberHotels,
      };
    });

    setGroups(groupsWithStats);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('groups').insert({
      user_id: user.id,
      name: newGroupName.trim(),
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Group created');
      setNewGroupName('');
      setCreateOpen(false);
      loadData();
    }
  }

  async function handleRenameGroup(groupId: string, newName: string) {
    const { error } = await supabase
      .from('groups')
      .update({ name: newName })
      .eq('id', groupId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Group renamed');
      setEditGroupId(null);
      loadData();
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Delete this group? Hotels will not be deleted.')) return;

    const { error } = await supabase.from('groups').delete().eq('id', groupId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Group deleted');
      loadData();
    }
  }

  async function handleManageHotels(groupId: string) {
    // Load current members
    const { data: members } = await supabase
      .from('group_hotels')
      .select('hotel_id')
      .eq('group_id', groupId);

    setSelectedHotelIds(new Set((members || []).map((m) => m.hotel_id)));
    setManageGroupId(groupId);
  }

  async function handleSaveHotelMembers() {
    if (!manageGroupId) return;

    // Delete existing memberships
    await supabase
      .from('group_hotels')
      .delete()
      .eq('group_id', manageGroupId);

    // Insert new memberships
    const inserts = Array.from(selectedHotelIds).map((hotel_id) => ({
      group_id: manageGroupId,
      hotel_id,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('group_hotels').insert(inserts);
      if (error) {
        toast.error(error.message);
        return;
      }
    }

    toast.success('Hotel memberships updated');
    setManageGroupId(null);
    loadData();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Groups</h1>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Group Name</Label>
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., West Coast Properties"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <Card className="p-12">
          <div className="text-center space-y-4">
            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No groups yet</h2>
            <p className="text-muted-foreground">
              Create groups to organize and compare your hotels.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  {editGroupId === group.id ? (
                    <Input
                      defaultValue={group.name}
                      autoFocus
                      onBlur={(e) => handleRenameGroup(group.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameGroup(group.id, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditGroupId(null);
                      }}
                      className="h-8 text-base font-semibold"
                    />
                  ) : (
                    <CardTitle
                      className="text-lg cursor-pointer"
                      onClick={() => router.push(`/groups/${group.id}`)}
                    >
                      {group.name}
                    </CardTitle>
                  )}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditGroupId(group.id)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteGroup(group.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HotelIcon className="h-4 w-4" />
                    {group.hotel_count} hotels
                  </div>
                  <div className={`text-2xl font-bold ${getScoreColor(group.weighted_average)}`}>
                    {formatScore(group.weighted_average)}
                  </div>
                </div>

                {/* Mini hotel list */}
                {group.hotels && group.hotels.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {group.hotels.slice(0, 3).map((hotel) => (
                      <div
                        key={hotel.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="truncate">{hotel.name}</span>
                        <span className={`font-medium ${getScoreColor(hotel.weighted_average)}`}>
                          {formatScore(hotel.weighted_average)}
                        </span>
                      </div>
                    ))}
                    {group.hotels.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{group.hotels.length - 3} more
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleManageHotels(group.id)}
                  >
                    <Users className="h-3 w-3 mr-1" />
                    Manage Hotels
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/groups/${group.id}`)}
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Manage Hotels Dialog */}
      <Dialog open={manageGroupId !== null} onOpenChange={(open) => !open && setManageGroupId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Hotels in {groups.find((g) => g.id === manageGroupId)?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {hotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedHotelIds.has(hotel.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedHotelIds);
                      if (checked) newSet.add(hotel.id);
                      else newSet.delete(hotel.id);
                      setSelectedHotelIds(newSet);
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{hotel.name}</p>
                    <p className="text-xs text-muted-foreground">{hotel.city || 'Unknown city'}</p>
                  </div>
                  <span className={`text-sm font-medium ${getScoreColor(hotel.weighted_average)}`}>
                    {formatScore(hotel.weighted_average)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-muted-foreground">
              {selectedHotelIds.size} hotels selected
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setManageGroupId(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveHotelMembers}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
