import { Channel, ChannelScore, ChannelScores } from './types';

/**
 * Normalization factors for each channel to bring scores to a 0-10 scale.
 * Google, TripAdvisor, Airbnb: 1-5 scale → multiply by 2
 * Booking.com: 1-10 scale → already normalized
 * Expedia/Hotels.com: 1-10 scale → already normalized
 */
export const NORMALIZATION_FACTORS: Record<Channel, number> = {
  google: 2,
  tripadvisor: 2,
  expedia: 1,
  booking: 1,
  airbnb: 2,
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  google: 'Google',
  tripadvisor: 'TripAdvisor',
  expedia: 'Expedia',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
};

export const CHANNEL_MAX_SCORES: Record<Channel, number> = {
  google: 5,
  tripadvisor: 5,
  expedia: 10,
  booking: 10,
  airbnb: 5,
};

export function normalizeScore(rawScore: number, channel: Channel): number {
  const factor = NORMALIZATION_FACTORS[channel];
  return Math.round(rawScore * factor * 100) / 100;
}

/**
 * Calculate weighted average score across all channels with data.
 * Formula: Σ(normalized_score_i × review_count_i) / Σ(review_count_i)
 */
export function calculateWeightedAverage(scores: ChannelScores): number | null {
  let totalWeightedScore = 0;
  let totalReviews = 0;

  const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];

  for (const channel of channels) {
    const score = scores[channel];
    if (score?.normalized_score != null && score?.total_reviews != null && score.total_reviews > 0) {
      totalWeightedScore += score.normalized_score * score.total_reviews;
      totalReviews += score.total_reviews;
    }
  }

  if (totalReviews === 0) return null;
  return Math.round((totalWeightedScore / totalReviews) * 100) / 100;
}

/**
 * Get score color class based on normalized score (0-10 scale)
 */
export function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-amber-600';
  return 'text-red-600';
}

export function getScoreBgColor(score: number | null): string {
  if (score === null) return 'bg-muted';
  if (score >= 8) return 'bg-emerald-50 border-emerald-200';
  if (score >= 6) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

export function formatScore(score: number | null, decimals: number = 1): string {
  if (score === null) return '—';
  return score.toFixed(decimals);
}

export function formatReviewCount(count: number | null): string {
  if (count === null) return '—';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}
