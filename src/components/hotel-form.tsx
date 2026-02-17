'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

interface HotelFormData {
  name: string;
  city: string;
  website_url: string;
  tripadvisor_url: string;
  expedia_url: string;
  booking_url: string;
}

interface HotelFormProps {
  onSubmit: (data: HotelFormData) => Promise<void>;
  initialData?: Partial<HotelFormData>;
  trigger?: React.ReactNode;
  title?: string;
}

export function HotelForm({ onSubmit, initialData, trigger, title = 'Add Hotel' }: HotelFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<HotelFormData>({
    name: initialData?.name || '',
    city: initialData?.city || '',
    website_url: initialData?.website_url || '',
    tripadvisor_url: initialData?.tripadvisor_url || '',
    expedia_url: initialData?.expedia_url || '',
    booking_url: initialData?.booking_url || '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      await onSubmit(formData);
      setOpen(false);
      setFormData({
        name: '',
        city: '',
        website_url: '',
        tripadvisor_url: '',
        expedia_url: '',
        booking_url: '',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Hotel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Hotel Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., Hilton Garden Inn"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData((d) => ({ ...d, city: e.target.value }))}
                placeholder="e.g., San Francisco"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website URL</Label>
            <Input
              id="website"
              value={formData.website_url}
              onChange={(e) => setFormData((d) => ({ ...d, website_url: e.target.value }))}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tripadvisor">TripAdvisor URL</Label>
            <Input
              id="tripadvisor"
              value={formData.tripadvisor_url}
              onChange={(e) => setFormData((d) => ({ ...d, tripadvisor_url: e.target.value }))}
              placeholder="https://www.tripadvisor.com/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expedia">Expedia URL</Label>
              <Input
                id="expedia"
                value={formData.expedia_url}
                onChange={(e) => setFormData((d) => ({ ...d, expedia_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking">Booking.com URL</Label>
              <Input
                id="booking"
                value={formData.booking_url}
                onChange={(e) => setFormData((d) => ({ ...d, booking_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.name.trim()}>
              {loading ? 'Saving...' : 'Save Hotel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
