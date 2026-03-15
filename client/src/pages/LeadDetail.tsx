import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Star, Phone, Mail, Globe, AlertTriangle, Copy, CheckCircle2,
  MessageSquare, Clock, Zap, TrendingUp, ShieldCheck, Facebook, MapPin
} from "lucide-react";
import type { Lead, PainSignal, ScoreBreakdown } from "@shared/schema";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary transition-colors">
      {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "Kopiert!" : "Kopier"}
    </button>
  );
}

function ScoreBar({ breakdown }: { breakdown: ScoreBreakdown[] }) {
  const total = breakdown.reduce((s, b) => s + b.points, 0);
  return (
    <div className="space-y-2">
      {breakdown.map((item, i) => {
        const pct = Math.min(100, Math.abs(item.points));
        const isPos = item.points >= 0;
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={isPos ? "text-green-400" : "text-red-400"}>{isPos ? "+" : ""}{item.points}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isPos ? "bg-green-500" : "bg-red-500"}`}
                style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground/70">{item.reason}</p>
          </div>
        );
      })}
      <div className="pt-2 border-t border-border flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span className={total >= 70 ? "text-green-400" : total >= 45 ? "text-amber-400" : "text-red-400"}>{total}</span>
      </div>
    </div>
  );
}

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = Number(params?.id);

  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: ["/api/leads", id],
    queryFn: () => apiRequest("GET", `/api/leads/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ status }: { status: string }) =>
      apiRequest("PATCH", `/api/leads/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/leads", id] }),
  });

  if (isLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Laster...</div>;
  if (!lead) return <div className="text-center py-20">Lead ikke funnet</div>;

  const painSignals = (lead.painSignals as PainSignal[]) || [];
  const leadBreakdown = (lead.leadScoreBreakdown as ScoreBreakdown[]) || [];
  const healthBreakdown = (lead.healthScoreBreakdown as ScoreBreakdown[]) || [];

  const scoreColor = (s: number) => s >= 70 ? "text-green-400" : s >= 45 ? "text-amber-400" : "text-red-400";
  const scoreBg = (s: number) => s >= 70 ? "bg-green-950/60 border-green-900/50 score-glow-high"
    : s >= 45 ? "bg-amber-950/60 border-amber-900/50 score-glow-mid"
    : "bg-red-950/60 border-red-900/50 score-glow-low";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <Link href="/dashboard">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> Tilbake til leads
        </button>
      </Link>

      {/* Header */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-bold">{lead.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {lead.city && <span>{lead.city}</span>}
                {lead.category && <span>· {lead.category}</span>}
                {lead.rating && (
                  <span className="flex items-center gap-1">
                    <Star size={13} className="text-amber-400 fill-amber-400" />
                    {lead.rating} ({lead.reviewCount ?? 0} anmeldelser)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} data-testid="link-phone"
                    className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors">
                    <Phone size={14} /> {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} data-testid="link-email"
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    <Mail size={14} /> {lead.email}
                  </a>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noopener" data-testid="link-website"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Globe size={14} /> Nettside
                  </a>
                )}
                {lead.facebookUrl && (
                  <a href={lead.facebookUrl} target="_blank" rel="noopener" data-testid="link-facebook"
                    className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-400 transition-colors">
                    <Facebook size={14} /> Facebook
                  </a>
                )}
                {lead.googleMapsUrl && (
                  <a href={lead.googleMapsUrl} target="_blank" rel="noopener" data-testid="link-maps"
                    className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
                    <MapPin size={14} /> Google Maps
                  </a>
                )}
              </div>
              {(lead as any).openingHours && (
                <div className="flex items-start gap-2 mt-2 p-2 rounded-lg bg-secondary/40 border border-border">
                  <Clock size={13} className="text-primary/70 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Åpningstider</p>
                    <p className="text-xs text-foreground">{(lead as any).openingHours}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex gap-3">
                <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${scoreBg(lead.leadScore ?? 0)}`}>
                  <span className={`text-2xl font-bold ${scoreColor(lead.leadScore ?? 0)}`}>{lead.leadScore ?? 0}</span>
                  <span className="text-xs text-muted-foreground">Lead Score</span>
                </div>
                <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${scoreBg(lead.healthScore ?? 0)}`}>
                  <span className={`text-2xl font-bold ${scoreColor(lead.healthScore ?? 0)}`}>{lead.healthScore ?? 0}</span>
                  <span className="text-xs text-muted-foreground">Health Score</span>
                </div>
              </div>
              <Select value={lead.status} onValueChange={v => updateMutation.mutate({ status: v })}>
                <SelectTrigger data-testid="select-status" className="w-44 bg-secondary border-border text-sm h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Ny</SelectItem>
                  <SelectItem value="contacted">Kontaktet</SelectItem>
                  <SelectItem value="interested">Interessert</SelectItem>
                  <SelectItem value="not_interested">Ikke interessert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pain signals */}
      {painSignals.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" /> Pain Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {painSignals.map((s, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-sm severity-${s.severity}`}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs mt-0.5 opacity-80">{s.description}</div>
                </div>
                <Badge variant="outline" className="ml-auto shrink-0 text-xs capitalize">{s.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="outreach">
        <TabsList className="bg-secondary w-full">
          <TabsTrigger value="outreach" className="flex-1 gap-2"><MessageSquare size={13} />Outreach</TabsTrigger>
          <TabsTrigger value="scores" className="flex-1 gap-2"><TrendingUp size={13} />Score analyse</TabsTrigger>
          <TabsTrigger value="enrichment" className="flex-1 gap-2"><Zap size={13} />Enrichment</TabsTrigger>
        </TabsList>

        {/* Outreach tab */}
        <TabsContent value="outreach" className="space-y-3 mt-4">
          {[
            { key: "coldMessage", label: "Kald melding", icon: MessageSquare, color: "text-primary", badge: "Dag 0" },
            { key: "followUp1Day", label: "Ring + SMS", icon: Clock, color: "text-blue-400", badge: "Dag 1" },
            { key: "followUp2Day", label: "Ny vinkel", icon: Clock, color: "text-blue-400", badge: "Dag 2" },
            { key: "followUp3Day", label: "Oppfølging", icon: Clock, color: "text-amber-400", badge: "Dag 3" },
            { key: "followUp4Day", label: "Kort påminnelse", icon: Clock, color: "text-amber-400", badge: "Dag 4" },
            { key: "followUp5Day", label: "Sosial proof", icon: Clock, color: "text-amber-400", badge: "Dag 5" },
            { key: "followUp6Day", label: "Tilbud", icon: Clock, color: "text-orange-400", badge: "Dag 6" },
            { key: "followUp7Day", label: "Siste sjanse", icon: Zap, color: "text-red-400", badge: "Dag 7" },
          ].map(({ key, label, icon: Icon, color, badge }) => {
            const text = lead[key as keyof Lead] as string | null;
            return (
              <Card key={key} className="bg-card border-border">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon size={14} className={color} />
                    {label}
                    <Badge variant="outline" className="text-xs">{badge}</Badge>
                  </CardTitle>
                  {text && <CopyButton text={text} />}
                </CardHeader>
                <CardContent>
                  {text ? (
                    <Textarea
                      data-testid={`textarea-${key}`}
                      defaultValue={text}
                      rows={4}
                      className="bg-secondary border-border text-sm resize-none"
                      readOnly
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Ikke generert ennå.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Scores tab */}
        <TabsContent value="scores" className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={14} className="text-primary" /> Lead Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leadBreakdown.length > 0
                  ? <ScoreBar breakdown={leadBreakdown} />
                  : <p className="text-sm text-muted-foreground">Ingen breakdown tilgjengelig.</p>}
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck size={14} className="text-blue-400" /> Health Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                {healthBreakdown.length > 0
                  ? <ScoreBar breakdown={healthBreakdown} />
                  : <p className="text-sm text-muted-foreground">Ingen breakdown tilgjengelig.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enrichment tab */}
        <TabsContent value="enrichment" className="space-y-3 mt-4">
          {lead.websiteSummary && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Globe size={14} /> Nettside oppsummering</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{lead.websiteSummary}</p>
              </CardContent>
            </Card>
          )}
          {lead.googleDescription && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Star size={14} className="text-amber-400" /> Google beskrivelse</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{lead.googleDescription}</p>
              </CardContent>
            </Card>
          )}
          {lead.facebookLastPost && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Facebook size={14} className="text-blue-400" /> Siste Facebook-post</CardTitle>
              </CardHeader>
              <CardContent>
                {lead.facebookLastPostDate && (
                  <p className="text-xs text-muted-foreground mb-2">{lead.facebookLastPostDate}</p>
                )}
                <p className="text-sm text-muted-foreground">{lead.facebookLastPost}</p>
              </CardContent>
            </Card>
          )}
          {!lead.websiteSummary && !lead.googleDescription && !lead.facebookLastPost && (
            <div className="text-center py-8 text-muted-foreground text-sm">Ingen enrichment-data tilgjengelig for denne leaden.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
