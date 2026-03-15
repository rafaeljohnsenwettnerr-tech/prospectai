import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, RefreshCw, Search, Star, Phone, Mail, Globe, AlertTriangle,
  TrendingUp, ChevronRight, Loader2, Clock, CheckCircle2, XCircle, Flame
} from "lucide-react";
import type { Lead, ScrapeJob, PainSignal } from "@shared/schema";

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "score-glow-high" : score >= 45 ? "score-glow-mid" : "score-glow-low";
  const bg = score >= 70 ? "bg-green-950/60 text-green-400 border-green-900/50"
    : score >= 45 ? "bg-amber-950/60 text-amber-400 border-amber-900/50"
    : "bg-red-950/60 text-red-400 border-red-900/50";
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-center ${bg} ${color}`}>
      <span className="text-lg font-bold leading-none">{score}</span>
      <span className="text-xs opacity-75 mt-0.5">{label}</span>
    </div>
  );
}

function PainSignalChip({ signal }: { signal: PainSignal }) {
  const cls = `severity-${signal.severity}`;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${cls}`}>
      <AlertTriangle size={10} />
      {signal.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-950/60 text-blue-400 border-blue-900/50",
    contacted: "bg-purple-950/60 text-purple-400 border-purple-900/50",
    interested: "bg-green-950/60 text-green-400 border-green-900/50",
    not_interested: "bg-red-950/60 text-red-400 border-red-900/50",
  };
  const labels: Record<string, string> = {
    new: "Ny", contacted: "Kontaktet", interested: "Interessert", not_interested: "Ikke interessert"
  };
  return <span className={`px-2 py-0.5 rounded border text-xs ${map[status] || map.new}`}>{labels[status] || status}</span>;
}

function JobStatusBar({ job }: { job: ScrapeJob }) {
  const pct = job.totalLeads ? Math.round((job.processedLeads / job.totalLeads) * 100) : 0;
  return (
    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium">
          {job.status === "running" && <Loader2 size={14} className="animate-spin text-primary" />}
          {job.status === "done" && <CheckCircle2 size={14} className="text-green-400" />}
          {job.status === "error" && <XCircle size={14} className="text-red-400" />}
          Jobb #{job.id} — {job.status === "running" ? "Kjører..." : job.status === "done" ? "Fullført" : "Feil"}
        </div>
        <span className="text-muted-foreground text-xs">{job.processedLeads} / {job.totalLeads || "?"} leads</span>
      </div>
      {job.status === "running" && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
      {job.status === "error" && (
        <p className="text-xs text-red-400">{job.error}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("lead_score");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: jobs = [], refetch: refetchJobs } = useQuery<ScrapeJob[]>({
    queryKey: ["/api/jobs"],
    queryFn: () => apiRequest("GET", "/api/jobs").then(r => r.json()),
    refetchInterval: (data) => {
      const arr = data?.state?.data as ScrapeJob[] | undefined;
      return arr?.some(j => j.status === "running") ? 3000 : false;
    },
  });

  const activeJobId = selectedJobId ?? jobs[0]?.id ?? null;

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/jobs", activeJobId, "leads"],
    queryFn: () => apiRequest("GET", `/api/jobs/${activeJobId}/leads`).then(r => r.json()),
    enabled: !!activeJobId,
    refetchInterval: jobs.find(j => j.id === activeJobId)?.status === "running" ? 5000 : false,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/leads/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", activeJobId, "leads"] });
    },
  });

  const activeJob = jobs.find(j => j.id === activeJobId);

  // Filter + sort
  const filtered = leads
    .filter(l => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.category?.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "lead_score") return (b.leadScore ?? 0) - (a.leadScore ?? 0);
      if (sortBy === "health_score") return (b.healthScore ?? 0) - (a.healthScore ?? 0);
      if (sortBy === "reviews") return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      return 0;
    });

  const stats = {
    total: leads.length,
    withEmail: leads.filter(l => l.email).length,
    withPhone: leads.filter(l => l.phone).length,
    highScore: leads.filter(l => (l.leadScore ?? 0) >= 70).length,
  };

  return (
    <div className="space-y-5">
      {/* Job selector + status */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Jobb:</span>
              <div className="flex gap-1">
                {jobs.map(j => (
                  <button key={j.id}
                    onClick={() => setSelectedJobId(j.id)}
                    className={`px-3 py-1 rounded text-xs border transition-colors ${activeJobId === j.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    #{j.id} · {j.status}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeJob && <JobStatusBar job={activeJob} />}
        </div>
      )}

      {/* Stats */}
      {leads.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Totale leads", value: stats.total, icon: TrendingUp, color: "text-primary" },
            { label: "Score 70+", value: stats.highScore, icon: Flame, color: "text-green-400" },
            { label: "Med telefon", value: stats.withPhone, icon: Phone, color: "text-amber-400" },
            { label: "Med e-post", value: stats.withEmail, icon: Mail, color: "text-blue-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <Icon size={20} className={color} />
                <div>
                  <div className="text-xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Søk etter bedrift, by..." value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
            className="pl-9 bg-secondary border-border" />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger data-testid="select-sort" className="w-44 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead_score">Lead Score ↓</SelectItem>
            <SelectItem value="health_score">Health Score ↓</SelectItem>
            <SelectItem value="reviews">Anmeldelser ↓</SelectItem>
            <SelectItem value="rating">Rating ↓</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger data-testid="select-filter" className="w-44 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statuser</SelectItem>
            <SelectItem value="new">Ny</SelectItem>
            <SelectItem value="contacted">Kontaktet</SelectItem>
            <SelectItem value="interested">Interessert</SelectItem>
            <SelectItem value="not_interested">Ikke interessert</SelectItem>
          </SelectContent>
        </Select>
        {activeJobId && (
          <a href={`/api/jobs/${activeJobId}/export`} download>
            <Button variant="outline" size="sm" className="gap-2" data-testid="btn-export">
              <Download size={14} /> Eksporter Excel
            </Button>
          </a>
        )}
        <Button variant="ghost" size="sm" onClick={() => refetchJobs()} data-testid="btn-refresh">
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* Empty state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-3" /> Laster leads...
        </div>
      )}
      {!isLoading && jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Search size={24} className="text-primary" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Ingen leads ennå</h3>
          <p className="text-muted-foreground text-sm mb-4">Gå til Oppsett og start ditt første søk.</p>
          <Link href="/"><Button className="bg-primary text-primary-foreground">Start søk</Button></Link>
        </div>
      )}
      {!isLoading && jobs.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Ingen leads matcher filteret.</div>
      )}

      {/* Lead cards */}
      <div className="grid gap-3">
        {filtered.map(lead => (
          <Card key={lead.id} data-testid={`card-lead-${lead.id}`}
            className="bg-card border-border hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                {/* Scores */}
                <div className="flex gap-2 shrink-0">
                  <ScoreBadge score={lead.leadScore ?? 0} label="Lead" />
                  <ScoreBadge score={lead.healthScore ?? 0} label="Health" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base leading-tight">{lead.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {lead.city && <span>{lead.city}</span>}
                        {lead.category && <span>· {lead.category}</span>}
                        {lead.rating && (
                          <span className="flex items-center gap-0.5">
                            <Star size={11} className="text-amber-400 fill-amber-400" />
                            {lead.rating} ({lead.reviewCount ?? 0})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={lead.status}
                        onValueChange={v => updateStatusMutation.mutate({ id: lead.id, status: v })}
                      >
                        <SelectTrigger data-testid={`status-${lead.id}`} className="h-7 w-36 bg-secondary border-border text-xs">
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

                  {/* Contact */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Phone size={11} /> {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                        <Mail size={11} /> {lead.email}
                      </a>
                    )}
                    {lead.website && (
                      <a href={lead.website} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Globe size={11} /> Nettside
                      </a>
                    )}
                  </div>

                  {/* Pain signals */}
                  {lead.painSignals && lead.painSignals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(lead.painSignals as PainSignal[]).slice(0, 4).map((s, i) => (
                        <PainSignalChip key={i} signal={s} />
                      ))}
                    </div>
                  )}

                  {/* Cold message preview */}
                  {lead.coldMessage && (
                    <div className="mt-2 p-2 rounded bg-secondary/50 border border-border text-xs text-muted-foreground line-clamp-2">
                      {lead.coldMessage}
                    </div>
                  )}
                </div>

                {/* Detail link */}
                <Link href={`/leads/${lead.id}`}>
                  <button data-testid={`btn-detail-${lead.id}`}
                    className="shrink-0 p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
