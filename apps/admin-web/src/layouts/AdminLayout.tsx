import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LoaderCircle, LogOut, Menu, Search, Wifi, WifiOff, X } from "lucide-react";
import { getVisibleGroups } from "../config/navigation";
import type { AdminContext, Environment, Screen } from "../types";
import { Breadcrumb, Button } from "../components/ui";
import { LanguageSelector, useLanguage } from "../lib/i18n";
import { APP_NAME, APP_VERSION } from "../lib/runtimeConfig";
import { EnvironmentBadge } from "../components/EnvironmentBadge";
import { ScopeBadge } from "../components/ScopeBadge";

export function AdminLayout({ context, environment, currentScreen, onNavigate, onLogout, children, realtime, onToggleMobile }: { context: AdminContext; environment: Environment; currentScreen: Screen; onNavigate: (s: Screen) => void; onLogout: () => void; children: ReactNode; realtime: "connecting" | "connected" | "offline"; onToggleMobile: () => void }) {
  const { t } = useLanguage();
  const groups = getVisibleGroups(context);
  const allVisibleItems = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label, localizedLabel: t(`nav.${i.id}`, i.label) })));
  const [navQuery, setNavQuery] = useState("");
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navResults = useMemo(() => {
    const q = navQuery.trim().toLocaleLowerCase();
    if (!q) return [];
    return allVisibleItems.filter((item) => `${item.localizedLabel} ${item.group} ${item.id}`.toLocaleLowerCase().includes(q)).slice(0, 8);
  }, [allVisibleItems, navQuery]);
  const current = allVisibleItems.find((i) => i.id === currentScreen);
  const version = APP_VERSION;
  const closeMobileNav = () => {
    setMobileNavOpen(false);
    document.getElementById("ridex-admin-sidebar")?.classList.remove("mobile-open");
  };
  const navigateFromSidebar = (screen: Screen) => {
    onNavigate(screen);
    closeMobileNav();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileNav();
        setMobileSearchOpen(false);
        setNavSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const openSearchResult = (screen: Screen) => { navigateFromSidebar(screen); setNavQuery(""); setNavSearchOpen(false); };

  return <div className={`rx-app-shell${mobileNavOpen ? " rx-mobile-nav-active" : ""}`}>
    {mobileNavOpen ? <button type="button" className="rx-mobile-nav-backdrop" aria-label="Close navigation menu" onClick={closeMobileNav} /> : null}
    <aside className="rx-sidebar" id="ridex-admin-sidebar" aria-label="Main navigation">
      <div className="rx-brand"><div className="rx-logo">R<span>X</span></div><div><strong>RideX</strong><small>{t("app.control")}</small></div></div>
      <div className="rx-scope-chip"><span className={`rx-live-dot ${realtime}`} /><div><strong>{context.name}</strong><small>{context.isSuperAdmin ? "Super Admin · Global" : `${context.role || "Admin"} · ${context.adminLevel}${context.stateName ? ` · ${context.stateName}` : ""}${context.cityName ? ` · ${context.cityName}` : ""}`}</small></div></div>
      <nav className="rx-nav" aria-label="RideX Admin navigation">{groups.map((g) => <div className="rx-nav-group" key={g.label}><div className="rx-nav-group-title">{t(`navGroup.${g.label}`, g.label)}</div>{g.items.map((item) => <button key={item.id} aria-current={item.id === currentScreen ? "page" : undefined} className={`rx-nav-item ${item.id === currentScreen ? "active" : ""}`} onClick={() => navigateFromSidebar(item.id)}>{item.icon}<span>{t(`nav.${item.id}`, item.label)}</span></button>)}</div>)}</nav>
      <div className="rx-sidebar-footer"><div className={`rx-connection ${realtime}`} aria-live="polite">{realtime === "connected" ? <Wifi size={14}/> : realtime === "connecting" ? <LoaderCircle className="spin" size={14}/> : <WifiOff size={14}/>}<small>{realtime === "connected" ? t("shell.realtimeConnected") : realtime === "connecting" ? t("shell.realtimeConnecting") : t("shell.realtimeOffline")}</small></div><Button variant="ghost" onClick={onLogout}><LogOut size={15}/>{t("common.signOut")}</Button></div>
    </aside>
    <main className="rx-main" id="ridex-main">
      <header className={`rx-topbar${mobileSearchOpen ? " rx-mobile-search-active" : ""}`}><button className="rx-icon-btn rx-menu-toggle" onClick={() => { setMobileNavOpen((open) => !open); onToggleMobile(); }} aria-expanded={mobileNavOpen} aria-controls="ridex-admin-sidebar" aria-label={t("shell.openNavigation")}><Menu size={18}/></button><Breadcrumb group={current ? t(`navGroup.${current.group}`, current.group) : t("nav.dashboard")} page={current ? current.localizedLabel : t("nav.dashboard")}/><div className="rx-global-search"><Search size={15}/><input aria-label={t("shell.globalSearch", "Search authorized workspaces")} placeholder={t("shell.globalSearch", "Search authorized workspaces")} value={navQuery} onFocus={() => setNavSearchOpen(true)} onChange={(event) => { setNavQuery(event.target.value); setNavSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") { setNavSearchOpen(false); setNavQuery(""); } else if (event.key === "Enter" && navResults[0]) { event.preventDefault(); openSearchResult(navResults[0].id); } }} />{navSearchOpen && navQuery.trim() ? <div className="rx-global-search-results" role="listbox">{navResults.length ? navResults.map((item) => <button type="button" role="option" aria-selected={item.id === currentScreen} key={item.id} onClick={() => openSearchResult(item.id)}><span>{item.localizedLabel}</span><small>{t(`navGroup.${item.group}`, item.group)}</small></button>) : <span className="rx-global-search-empty">{t("common.noMatchingRecords", "No matching authorized workspace")}</span>}</div> : null}</div><div className="rx-topbar-right"><button type="button" className="rx-icon-btn rx-mobile-search-toggle" aria-label={mobileSearchOpen ? "Close workspace search" : "Search workspaces"} aria-expanded={mobileSearchOpen} onClick={() => { setMobileSearchOpen((open) => !open); setNavSearchOpen(!mobileSearchOpen); }}><Search size={17}/></button><LanguageSelector compact/><EnvironmentBadge environment={environment}/><ScopeBadge context={context}/></div>{mobileSearchOpen ? <div className="rx-global-search rx-mobile-global-search"><Search size={15}/><input autoFocus aria-label={t("shell.globalSearch", "Search authorized workspaces")} placeholder={t("shell.globalSearch", "Search authorized workspaces")} value={navQuery} onFocus={() => setNavSearchOpen(true)} onChange={(event) => { setNavQuery(event.target.value); setNavSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") { setMobileSearchOpen(false); setNavSearchOpen(false); setNavQuery(""); } else if (event.key === "Enter" && navResults[0]) { event.preventDefault(); openSearchResult(navResults[0].id); setMobileSearchOpen(false); } }} />{navQuery.trim() ? <div className="rx-global-search-results" role="listbox">{navResults.length ? navResults.map((item) => <button type="button" role="option" aria-selected={item.id === currentScreen} key={item.id} onClick={() => { openSearchResult(item.id); setMobileSearchOpen(false); }}><span>{item.localizedLabel}</span><small>{t(`navGroup.${item.group}`, item.group)}</small></button>) : <span className="rx-global-search-empty">{t("common.noMatchingRecords", "No matching authorized workspace")}</span>}</div> : null}</div> : null}</header>
      <div className="rx-content">{children}<footer className="rx-footer"><span>{APP_NAME} Web</span><span>v{version}</span><span>{t("shell.backendControls")}</span></footer></div>
    </main>
  </div>;
}
