'use client';

import { formatScore, formatReviewCount, getScoreColor, getScoreBgColor, CHANNEL_LABELS } from '@/lib/scoring';
import { Channel, ChannelScore } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ScoreBadgeProps {
  channel: Channel;
  score: ChannelScore | null;
  compact?: boolean;
}

export function ScoreBadge({ channel, score, compact = false }: ScoreBadgeProps) {
  if (!score || score.normalized_score === null) {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className={`text-sm font-semibold ${getScoreColor(score.normalized_score)}`}>
            {formatScore(score.normalized_score)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{CHANNEL_LABELS[channel]}: {formatScore(score.average_score)} raw</p>
          <p>{formatReviewCount(score.total_reviews)} reviews</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="text-center">
          <div className={`text-sm font-bold ${getScoreColor(score.normalized_score)}`}>
            {formatScore(score.normalized_score)}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatReviewCount(score.total_reviews)} reviews
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Raw score: {formatScore(score.average_score)}</p>
        <p>Normalized to 0-10 scale</p>
        {score.fetched_at && (
          <p className="text-xs opacity-75">
            Updated: {new Date(score.fetched_at).toLocaleDateString()}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
