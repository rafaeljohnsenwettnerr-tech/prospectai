import { Switch, Route } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import LeadDetail from "@/pages/LeadDetail";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Switch hook={useHashLocation}>
          <Route path="/" component={Setup} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/leads/:id" component={LeadDetail} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
      <Toaster />
    </QueryClientProvider>
  );
}
