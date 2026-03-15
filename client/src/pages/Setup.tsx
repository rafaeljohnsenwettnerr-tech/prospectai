import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronRight, Key, Building2, Target, Zap, Loader2, Eye, EyeOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const STEPS = [
  { id: 1, title: "API-nøkler", icon: Key, desc: "Koble til dine tjenester" },
  { id: 2, title: "Din bedrift", icon: Building2, desc: "Hvem er du og hva selger du?" },
  { id: 3, title: "Din ICP", icon: Target, desc: "Hvem vil du nå?" },
  { id: 4, title: "Start søket", icon: Zap, desc: "Finn leads automatisk" },
];

const SERVICE_CATEGORIES = [
  "Bilpleie", "Bilvask", "Rørlegger", "Elektriker", "Frisør", "Hudpleie",
  "Rengjøring", "Tannlege", "Treningsstudio", "Bilverksted", "Murarbeid",
  "Maler", "Snekker", "Hagearbeid", "Annet"
];

export default function Setup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [showKeys, setShowKeys] = useState(false);

  // API keys — prefilled from server (.env)
  const [keys, setKeys] = useState({ openaiKey: "", tavilyKey: "", firecrawlKey: "", apifyKey: "", findymailKey: "" });
  const [keysPrefilled, setKeysPrefilled] = useState(false);

  // Business profile
  const [profile, setProfile] = useState({
    name: "", category: "", description: "", targetCity: "", valueProposition: "", senderName: "", senderPhone: ""
  });

  // ICP
  const [icp, setIcp] = useState({
    targetCategory: "", targetCity: "", minRating: 0, maxRating: 5, minReviews: 0, maxReviews: 500,
    keywords: [] as string[], painPoints: [] as string[], numberOfLeads: 30,
  });
  const [keyword, setKeyword] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const { data: configStatus } = useQuery({
    queryKey: ["/api/config/status"],
    queryFn: () => apiRequest("GET", "/api/config/status").then(r => r.json()),
  });

  // Prefill keys from server on first load
  const { data: existingKeys } = useQuery({
    queryKey: ["/api/config/keys"],
    queryFn: () => apiRequest("GET", "/api/config/keys").then(r => r.json()),
  });

  // Merge server keys into local state once loaded
  const mergedKeys = {
    openaiKey: keys.openaiKey || existingKeys?.openaiKey || "",
    tavilyKey: keys.tavilyKey || existingKeys?.tavilyKey || "",
    firecrawlKey: keys.firecrawlKey || existingKeys?.firecrawlKey || "",
    apifyKey: keys.apifyKey || existingKeys?.apifyKey || "",
    findymailKey: keys.findymailKey || existingKeys?.findymailKey || "",
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (step === 1) {
        await apiRequest("POST", "/api/config", mergedKeys);
      } else if (step === 2) {
        await apiRequest("POST", "/api/profile", profile);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setStep(s => Math.min(s + 1, 4));
      toast({ title: "Lagret!", description: "Gå videre til neste steg." });
    },
    onError: (e: any) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  const startJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/start", {
        ...icp,
        targetCity: icp.targetCity || profile.targetCity,
        minRating: icp.minRating || null,
        maxRating: icp.maxRating < 5 ? icp.maxRating : null,
        minReviews: icp.minReviews || null,
        maxReviews: icp.maxReviews < 500 ? icp.maxReviews : null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Søk startet!", description: `Jobb #${data.jobId} kjører nå.` });
      navigate("/dashboard");
    },
    onError: (e: any) => toast({ title: "Feil", description: e.message, variant: "destructive" }),
  });

  const addKeyword = () => {
    if (keyword.trim()) {
      setIcp(p => ({ ...p, keywords: [...p.keywords, keyword.trim()] }));
      setKeyword("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <button
              onClick={() => step > s.id && setStep(s.id)}
              className="flex items-center gap-2 group"
              data-testid={`step-${s.id}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step > s.id ? "step-done" : step === s.id ? "step-active" : "step-pending"
              }`}>
                {step > s.id ? <CheckCircle2 size={16} /> : s.id}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${step === s.id ? "text-primary" : "text-muted-foreground"}`}>
                {s.title}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px ${step > s.id ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: API Keys */}
      {step === 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key size={18} className="text-primary" /> API-nøkler
            </CardTitle>
            <CardDescription>
              Koble til dine tjenester. Nøklene lagres kun i minnet — aldri til disk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configStatus?.configured && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-950/40 border border-green-900/50 text-green-400 text-sm">
                <CheckCircle2 size={15} /> API-nøkler er allerede konfigurert
              </div>
            )}
            {[
              { key: "openaiKey", label: "OpenAI API-nøkkel", placeholder: "sk-..." },
              { key: "tavilyKey", label: "Tavily API-nøkkel", placeholder: "tvly-..." },
              { key: "firecrawlKey", label: "Firecrawl API-nøkkel", placeholder: "fc-..." },
              { key: "apifyKey", label: "Apify API-nøkkel", placeholder: "apify_api_..." },
              { key: "findymailKey", label: "Findymail API-nøkkel (valgfri — finner e-poster automatisk)", placeholder: "fm_..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label className="text-sm text-muted-foreground">{label}</Label>
                <div className="relative">
                  <Input
                    data-testid={`input-${key}`}
                    type={showKeys ? "text" : "password"}
                    placeholder={placeholder}
                    value={mergedKeys[key as keyof typeof mergedKeys]}
                    onChange={e => setKeys(p => ({ ...p, [key]: e.target.value }))}
                    className="bg-secondary border-border pr-10"
                  />
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowKeys(v => !v)}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
            >
              {showKeys ? <EyeOff size={12} /> : <Eye size={12} />}
              {showKeys ? "Skjul nøkler" : "Vis nøkler"}
            </button>
            <Button
              data-testid="btn-save-keys"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !mergedKeys.openaiKey}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saveMutation.isPending ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
              Lagre og fortsett <ChevronRight size={15} className="ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Business Profile */}
      {step === 2 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 size={18} className="text-primary" /> Din bedrift
            </CardTitle>
            <CardDescription>AI-en bruker dette til å skrive personaliserte meldinger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Bedriftsnavn</Label>
                <Input data-testid="input-company-name" placeholder="f.eks. GrowthBoost AS" value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Din kategori / bransje</Label>
                <Input data-testid="input-company-category" placeholder="f.eks. Marketing automation" value={profile.category}
                  onChange={e => setProfile(p => ({ ...p, category: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Ditt verdiforslag (hva selger du?)</Label>
              <Textarea data-testid="input-value-prop"
                placeholder="f.eks. Jeg hjelper bilpleie-bedrifter med å automatisere Google-anmeldelser, online booking 24/7, SMS ved tapt anrop og reaktivering av gamle kunder."
                value={profile.valueProposition}
                onChange={e => setProfile(p => ({ ...p, valueProposition: e.target.value }))}
                className="bg-secondary border-border resize-none" rows={3} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Kort beskrivelse av din bedrift</Label>
              <Textarea data-testid="input-description" placeholder="Beskriv kort hva dere gjør og hvem dere hjelper..."
                value={profile.description}
                onChange={e => setProfile(p => ({ ...p, description: e.target.value }))}
                className="bg-secondary border-border resize-none" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Ditt navn (selger)</Label>
                <Input data-testid="input-sender-name" placeholder="f.eks. Rafael" value={profile.senderName}
                  onChange={e => setProfile(p => ({ ...p, senderName: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Telefon (valgfri)</Label>
                <Input data-testid="input-sender-phone" placeholder="+47 999 99 999" value={profile.senderPhone}
                  onChange={e => setProfile(p => ({ ...p, senderPhone: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Primærby (default for søk)</Label>
              <Input data-testid="input-target-city" placeholder="f.eks. Drammen" value={profile.targetCity}
                onChange={e => setProfile(p => ({ ...p, targetCity: e.target.value }))}
                className="bg-secondary border-border" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Tilbake</Button>
              <Button data-testid="btn-save-profile" onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !profile.name || !profile.valueProposition}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                {saveMutation.isPending ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
                Neste <ChevronRight size={15} className="ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: ICP */}
      {step === 3 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target size={18} className="text-primary" /> Din ideelle kundes profil (ICP)
            </CardTitle>
            <CardDescription>Definer hvem du vil nå. AI-en filtrerer og prioriterer basert på dette.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Kategori å søke etter</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {SERVICE_CATEGORIES.map(cat => (
                    <button key={cat}
                      onClick={() => setIcp(p => ({ ...p, targetCategory: cat }))}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${icp.targetCategory === cat ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <Input data-testid="input-icp-category" placeholder="Eller skriv selv..." value={icp.targetCategory}
                  onChange={e => setIcp(p => ({ ...p, targetCategory: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">By å søke i</Label>
                <Input data-testid="input-icp-city" placeholder="f.eks. Drammen"
                  value={icp.targetCity || profile.targetCity}
                  onChange={e => setIcp(p => ({ ...p, targetCity: e.target.value }))}
                  className="bg-secondary border-border" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Antall leads: <span className="text-primary font-semibold">{icp.numberOfLeads}</span>
              </Label>
              <Slider
                data-testid="slider-leads"
                min={5} max={100} step={5}
                value={[icp.numberOfLeads]}
                onValueChange={([v]) => setIcp(p => ({ ...p, numberOfLeads: v }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5</span><span>50</span><span>100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Min. rating: <span className="text-primary font-semibold">{icp.minRating === 0 ? "Alle" : icp.minRating}</span>
                </Label>
                <Slider min={0} max={5} step={0.5} value={[icp.minRating]}
                  onValueChange={([v]) => setIcp(p => ({ ...p, minRating: v }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Maks. rating: <span className="text-primary font-semibold">{icp.maxRating >= 5 ? "Alle" : icp.maxRating}</span>
                </Label>
                <Slider min={1} max={5} step={0.5} value={[icp.maxRating]}
                  onValueChange={([v]) => setIcp(p => ({ ...p, maxRating: v }))} />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Tip:</span> Bedrifter med lav rating (under 4.0) er ofte de beste leads — de trenger mest hjelp med reviews.
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Søkeord (tillegg til kategori)</Label>
              <div className="flex gap-2">
                <Input placeholder="f.eks. bilpleie, detailing..." value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addKeyword()}
                  className="bg-secondary border-border flex-1" />
                <Button variant="outline" size="sm" onClick={addKeyword}>Legg til</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {icp.keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 cursor-pointer"
                    onClick={() => setIcp(p => ({ ...p, keywords: p.keywords.filter((_, j) => j !== i) }))}>
                    {kw} ×
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Tilbake</Button>
              <Button data-testid="btn-next-to-launch" onClick={() => setStep(4)}
                disabled={!icp.targetCategory}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                Neste <ChevronRight size={15} className="ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Launch */}
      {step === 4 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap size={18} className="text-primary" /> Start søket
            </CardTitle>
            <CardDescription>Bekreft innstillingene og start AI-søket etter leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Søker etter", value: icp.targetCategory },
                { label: "By", value: icp.targetCity || profile.targetCity },
                { label: "Antall leads", value: `${icp.numberOfLeads} bedrifter` },
                { label: "Rating filter", value: icp.minRating > 0 || icp.maxRating < 5 ? `${icp.minRating} – ${icp.maxRating}` : "Alle" },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-semibold text-sm mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm space-y-2">
              <div className="font-semibold text-primary flex items-center gap-2"><Zap size={14} /> Hva skjer nå:</div>
              <ul className="space-y-1 text-muted-foreground">
                <li>1. Apify henter {icp.numberOfLeads} bedrifter fra Google Maps</li>
                <li>2. Tavily søker etter hvert selskaps nettilstedeværelse</li>
                <li>3. Firecrawl leser nettsider + Facebook-sider</li>
                <li>4. GPT-4o analyserer pain signals og skriver outreach</li>
              </ul>
              <div className="text-xs text-muted-foreground pt-1">
                Estimert tid: ~{Math.ceil(icp.numberOfLeads * 0.5)} minutter
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Tilbake</Button>
              <Button
                data-testid="btn-start-job"
                onClick={() => startJobMutation.mutate()}
                disabled={startJobMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {startJobMutation.isPending
                  ? <><Loader2 size={15} className="animate-spin mr-2" /> Starter...</>
                  : <><Zap size={15} className="mr-2" /> Start søket</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
