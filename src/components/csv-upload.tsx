'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Check, X, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedHotel {
  name: string;
  city: string;
  website_url: string;
  tripadvisor_url: string;
  expedia_url: string;
  booking_url: string;
  valid: boolean;
  error?: string;
}

interface CSVUploadProps {
  onImport: (hotels: Omit<ParsedHotel, 'valid' | 'error'>[]) => Promise<void>;
}

// Title Case: capitalize first letter of each word
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CSVUpload({ onImport }: CSVUploadProps) {
  const [parsedHotels, setParsedHotels] = useState<ParsedHotel[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const hotels: ParsedHotel[] = results.data.map((item: unknown) => {
          const row = item as Record<string, string>;
          // Flexible column name matching
          const name = row['Hotel Name'] || row['hotel_name'] || row['name'] || row['Name'] || row['Property Name'] || row['property_name'] || '';
          const city = row['City'] || row['city'] || row['Location'] || row['location'] || '';
          const website = row['Website'] || row['website'] || row['Website URL'] || row['website_url'] || row['URL'] || '';
          const tripadvisor = row['TripAdvisor URL'] || row['tripadvisor_url'] || row['TripAdvisor'] || row['tripadvisor'] || '';
          const expedia = row['Expedia URL'] || row['expedia_url'] || row['Expedia'] || row['expedia'] || '';
          const booking = row['Booking URL'] || row['booking_url'] || row['Booking'] || row['booking'] || row['Booking.com URL'] || row['booking_com'] || row['Booking_com'] || row['Booking.com'] || '';

          const trimmedName = name.trim();
          const trimmedCity = city.trim();
          const valid = trimmedName.length > 0;
          return {
            name: trimmedName ? toTitleCase(trimmedName) : '',
            city: trimmedCity ? toTitleCase(trimmedCity) : '',
            website_url: website.trim(),
            tripadvisor_url: tripadvisor.trim(),
            expedia_url: expedia.trim(),
            booking_url: booking.trim(),
            valid,
            error: valid ? undefined : 'Hotel name is required',
          };
        });

        setParsedHotels(hotels);
        setStep('preview');
      },
      error: (error) => {
        console.error('CSV parse error:', error);
      },
    });
  }

  async function handleImport() {
    const validHotels = parsedHotels.filter((h) => h.valid);
    if (validHotels.length === 0) return;

    setImporting(true);
    try {
      await onImport(
        validHotels.map(({ valid, error, ...hotel }) => hotel)
      );
      setStep('done');
    } catch (err) {
      console.error('Import error:', err);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setParsedHotels([]);
    setFileName('');
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const validCount = parsedHotels.filter((h) => h.valid).length;
  const invalidCount = parsedHotels.filter((h) => !h.valid).length;

  if (step === 'done') {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Check className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Import Complete</h3>
          <p className="text-muted-foreground mt-1">
            Successfully imported {validCount} hotels.
          </p>
          <Button onClick={reset} variant="outline" className="mt-4">
            Import Another File
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'preview') {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Preview: {fileName}
              </CardTitle>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">{parsedHotels.length} rows found</Badge>
                <Badge className="bg-emerald-100 text-emerald-800">{validCount} valid</Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">{invalidCount} invalid</Badge>
                )}
              </div>
            </div>
            {/* Primary Import Button — always visible at top */}
            <div className="flex gap-2">
              <Button
                size="lg"
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md"
              >
                <Check className="h-4 w-4 mr-2" />
                {importing ? 'Importing...' : `Import ${validCount} Hotels`}
              </Button>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hotel Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>TripAdvisor</TableHead>
                  <TableHead>Booking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedHotels.map((hotel, index) => (
                  <TableRow key={index} className={!hotel.valid ? 'bg-red-50' : ''}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      {hotel.valid ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{hotel.name || '—'}</TableCell>
                    <TableCell>{hotel.city || '—'}</TableCell>
                    <TableCell className="max-w-32 truncate text-xs">
                      {hotel.website_url || '—'}
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-xs">
                      {hotel.tripadvisor_url || '—'}
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-xs">
                      {hotel.booking_url || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-8">
        <div
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold">Upload CSV File</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Expected columns: Hotel Name, City, Website (optional), TripAdvisor URL (optional), Booking URL (optional), Expedia URL (optional)
          </p>
          <Button variant="outline" className="mt-4">
            Choose File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </CardContent>
    </Card>
  );
}
