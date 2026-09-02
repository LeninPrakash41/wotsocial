/**
 * WordPress and Shopify connections.
 *
 * Both are verified against the remote site before anything is stored, and
 * both credentials are encrypted server-side — the browser only ever sees a
 * masked preview. These feed the blog writer and the product promo agent.
 */
import { useEffect, useState } from 'react';
import { Globe, Store, ShieldCheck, Link2, AlertTriangle } from 'lucide-react';
import { contentApi } from '../services/studioApi';
import { describeError } from '../services/integrationsApi';
import { getBrands, getBrandById, Brand } from '../dbAdapter';
import {
  Card, CardHeader, Button, Banner, Badge, Field, Input, BannerKind
} from './ui';

export function ContentConnections() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [wordpress, setWordpress] = useState<any>(null);
  const [shopify, setShopify] = useState<any>(null);
  const [busy, setBusy] = useState<'wordpress' | 'shopify' | null>(null);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null);

  const [wpSite, setWpSite] = useState('');
  const [wpUser, setWpUser] = useState('');
  const [wpPassword, setWpPassword] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [shopToken, setShopToken] = useState('');

  const load = async () => {
    try {
      const activeId = localStorage.getItem('activeBrandId');
      let current: Brand | null = activeId ? await getBrandById(activeId) : null;
      if (!current) {
        const all = await getBrands();
        current = all[0] || null;
      }
      if (!current) return;
      setBrand(current);

      const res = await contentApi.connections(current.id);
      setWordpress(res.wordpress);
      setShopify(res.shopify);
      if (res.wordpress) {
        setWpSite(res.wordpress.siteUrl || '');
        setWpUser(res.wordpress.identifier || '');
      }
      if (res.shopify) setShopDomain(res.shopify.identifier || '');
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  useEffect(() => {
    load();
    const onBrandChange = () => load();
    window.addEventListener('activeBrandChanged', onBrandChange);
    return () => window.removeEventListener('activeBrandChanged', onBrandChange);
  }, []);

  const connectWordPress = async () => {
    if (!brand) return;
    setBusy('wordpress');
    setBanner(null);
    try {
      const res = await contentApi.connectWordPress({
        brandId: brand.id,
        siteUrl: wpSite.trim(),
        username: wpUser.trim(),
        applicationPassword: wpPassword
      });
      setWordpress(res.connection);
      setWpPassword('');
      setBanner({
        kind: 'success',
        message: `Connected to ${res.site?.name || wpSite} as ${wpUser}. Articles can now be sent there as drafts.`
      });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const connectShopify = async () => {
    if (!brand) return;
    setBusy('shopify');
    setBanner(null);
    try {
      const res = await contentApi.connectShopify({
        brandId: brand.id,
        storeDomain: shopDomain.trim(),
        accessToken: shopToken.trim()
      });
      setShopify(res.connection);
      setShopToken('');
      setBanner({
        kind: 'success',
        message: `Connected to ${res.shop?.name || shopDomain}. Products are available in the Poster Studio.`
      });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (kind: 'wordpress' | 'shopify') => {
    if (!brand) return;
    try {
      await contentApi.disconnect(brand.id, kind);
      if (kind === 'wordpress') { setWordpress(null); setWpPassword(''); }
      else { setShopify(null); setShopToken(''); }
      setBanner({ kind: 'info', message: 'Disconnected. The stored credential was deleted.' });
    } catch (err) {
      setBanner({ kind: 'error', message: describeError(err) });
    }
  };

  return (
    <div className="space-y-4">
      {banner && <Banner kind={banner.kind} message={banner.message} onDismiss={() => setBanner(null)} />}

      {!brand && (
        <Banner kind="warning" message="Create a brand before connecting a site or store — connections are per brand." />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* WordPress */}
        <Card className="space-y-4">
          <CardHeader
            icon={Globe}
            title="WordPress"
            description="Lets the blog writer send finished articles to your site as drafts."
            actions={wordpress ? <Badge tone="ok">Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
          />

          {wordpress ? (
            <div className="space-y-3">
              <div className="space-y-1 rounded-xl border border-ok-line bg-ok-soft p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-ok">
                  <ShieldCheck className="h-4 w-4" /> {wordpress.siteUrl}
                </div>
                <p className="text-[11px] text-ink-3">
                  Signed in as {wordpress.identifier}
                  {wordpress.metadata?.roles?.length ? ` · ${wordpress.metadata.roles.join(', ')}` : ''}
                </p>
                <p className="font-mono text-[11px] text-ink-4">Password {wordpress.secretPreview}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => disconnect('wordpress')}>Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-3.5">
              <Field label="Site URL" required>
                <Input value={wpSite} onChange={e => setWpSite(e.target.value)} placeholder="https://yourblog.com" />
              </Field>
              <Field label="Username" required>
                <Input value={wpUser} onChange={e => setWpUser(e.target.value)} placeholder="editor" />
              </Field>
              <Field
                label="Application password"
                required
                hint="Not your login password. Create one in WordPress under Users → Profile → Application Passwords; it can be revoked on its own."
              >
                <Input
                  type="password"
                  value={wpPassword}
                  onChange={e => setWpPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                />
              </Field>
              <Button
                variant="accent"
                icon={Link2}
                loading={busy === 'wordpress'}
                disabled={!brand || !wpSite || !wpUser || !wpPassword}
                onClick={connectWordPress}
                className="w-full"
              >
                Verify & connect
              </Button>
            </div>
          )}
        </Card>

        {/* Shopify */}
        <Card className="space-y-4">
          <CardHeader
            icon={Store}
            title="Shopify"
            description="Pulls your products in so the promo agent can write posters for them."
            actions={shopify ? <Badge tone="ok">Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
          />

          {shopify ? (
            <div className="space-y-3">
              <div className="space-y-1 rounded-xl border border-ok-line bg-ok-soft p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-ok">
                  <ShieldCheck className="h-4 w-4" /> {shopify.metadata?.shopName || shopify.identifier}
                </div>
                <p className="text-[11px] text-ink-3">
                  {shopify.identifier}
                  {shopify.metadata?.currency ? ` · ${shopify.metadata.currency}` : ''}
                </p>
                <p className="font-mono text-[11px] text-ink-4">Token {shopify.secretPreview}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => disconnect('shopify')}>Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-3.5">
              <Field label="Store domain" required hint="Either your myshopify domain or just the store name.">
                <Input value={shopDomain} onChange={e => setShopDomain(e.target.value)} placeholder="your-store.myshopify.com" />
              </Field>
              <Field
                label="Admin API access token"
                required
                hint="From a custom app in your Shopify admin (Settings → Apps → Develop apps). It only needs the read_products scope."
              >
                <Input
                  type="password"
                  value={shopToken}
                  onChange={e => setShopToken(e.target.value)}
                  placeholder="shpat_…"
                />
              </Field>
              <Button
                variant="accent"
                icon={Link2}
                loading={busy === 'shopify'}
                disabled={!brand || !shopDomain || !shopToken}
                onClick={connectShopify}
                className="w-full"
              >
                Verify & connect
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sunk px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-4" />
        <p className="text-[11px] leading-relaxed text-ink-3">
          These credentials are encrypted before they are stored and are never sent to the browser. Articles are
          published to WordPress as drafts unless you explicitly choose to publish live.
        </p>
      </div>
    </div>
  );
}
