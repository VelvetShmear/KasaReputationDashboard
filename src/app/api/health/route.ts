import { NextResponse } from 'next/server';

export async function GET() {
  const keys = {
    google: !!process.env.GOOGLE_PLACES_API_KEY,
    rapidapi: !!process.env.RAPIDAPI_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };

  const channels = {
    google: keys.google,
    tripadvisor: keys.rapidapi,
    booking: keys.rapidapi,
    expedia: keys.rapidapi,
  };

  const missingKeys: string[] = [];
  if (!keys.google) missingKeys.push('GOOGLE_PLACES_API_KEY');
  if (!keys.rapidapi) missingKeys.push('RAPIDAPI_KEY');
  if (!keys.anthropic) missingKeys.push('ANTHROPIC_API_KEY');

  return NextResponse.json({
    configured: missingKeys.length === 0,
    keys,
    channels,
    missingKeys,
  });
}
