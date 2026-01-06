"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getInterventionStyle, formatTime } from "@/lib/intervention-utils";
import type { Intervention } from "@/types/schedule";

interface InterventionCardProps {
  intervention: Intervention;
}

export function InterventionCard({ intervention }: InterventionCardProps) {
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-white/50 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-x-1">
      <CardContent className="flex items-center gap-4 py-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bgColor} ring-2 ring-white/50`}
        >
          <Icon className={`h-5 w-5 ${style.textColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{intervention.title}</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            {intervention.description}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 bg-white/70 text-slate-600 font-medium"
        >
          {formatTime(intervention.time)}
        </Badge>
      </CardContent>
    </Card>
  );
}
