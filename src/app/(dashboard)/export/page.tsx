'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Group } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function ExportPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [hotelCount, setHotelCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: groupsData } = await supabase
      .from('groups')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    setGroups(groupsData || []);

    const { count } = await supabase
      .from('hotels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setHotelCount(count || 0);
  }

  function handleExport(format: 'csv' | 'xlsx') {
    let url = selectedGroup === 'all'
      ? `/api/export?format=${format}`
      : `/api/export?group_id=${selectedGroup}&format=${format}`;

    window.open(url, '_blank');
    toast.success(`${format.toUpperCase()} export started`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Export Data</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Reputation Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export your hotel review data as a CSV or Excel file. The export includes hotel details,
            raw and normalized scores for all 5 channels, weighted averages, group memberships, and resolved platform names for verification.
          </p>

          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hotels ({hotelCount})</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            <strong>Columns included:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>Hotel Name, City, State, Hotel Type, Keys</li>
              <li>Google Score (Raw 1-5 & Normalized 0-10) & Reviews</li>
              <li>TripAdvisor Score (Raw 1-5 & Normalized 0-10) & Reviews</li>
              <li>Booking.com Score (0-10) & Reviews</li>
              <li>Expedia Score (0-10) & Reviews</li>
              <li>Airbnb Score (Raw 1-5 & Normalized 0-10) & Reviews</li>
              <li>Weighted Average Score</li>
              <li>Group Name(s)</li>
              <li>Resolved Platform Names (Booking, Expedia, TripAdvisor)</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleExport('csv')}
              disabled={hotelCount === 0}
              variant="outline"
              className="w-full"
            >
              <FileText className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
            <Button
              onClick={() => handleExport('xlsx')}
              disabled={hotelCount === 0}
              className="w-full"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
          </div>

          {hotelCount === 0 && (
            <p className="text-sm text-amber-600">
              No hotels to export. Add hotels first.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
