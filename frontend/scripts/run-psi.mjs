#!/usr/bin/env node
/**
 * Lightweight PageSpeed Insights client that avoids the abandoned
 * `psi` npm dependency. Relies on the public REST API via fetch.
 * Set PSI_API_KEY to unlock higher quotas.
 */

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const args = process.argv.slice(2);

let url;
const strategyFlags = new Set();
let outputJson = false;
let apiKey = process.env.PSI_API_KEY ?? null;

const takeValue = (currentIndex, provided) => {
  if (provided) {
    return provided;
  }
  const next = args[currentIndex + 1];
  if (next && !next.startsWith('--')) {
    return next;
  }
  return undefined;
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith('--')) {
    if (!url) {
      url = arg;
    }
    continue;
  }

  const [flag, inlineValue] = arg.split('=');
  const value = takeValue(i, inlineValue);

  switch (flag) {
    case '--url':
      if (value) {
        url = value;
      }
      break;
    case '--strategy':
      if (value) {
        strategyFlags.add(value.toLowerCase());
      }
      break;
    case '--mobile':
      strategyFlags.add('mobile');
      break;
    case '--desktop':
      strategyFlags.add('desktop');
      break;
    case '--json':
      outputJson = true;
      break;
    case '--api-key':
      if (value) {
        apiKey = value;
      }
      break;
    default:
      console.warn(`Warning: Unknown flag "${flag}"`);
  }
}

if (!url) {
  console.error('Usage: npm run psi -- --url <https://example.com> [--strategy mobile|desktop] [--json]');
  process.exit(1);
}

if (!strategyFlags.size) {
  strategyFlags.add('mobile');
  strategyFlags.add('desktop');
}

const formatSeconds = (milliseconds) => {
  if (milliseconds == null) {
    return 'n/a';
  }
  return `${(milliseconds / 1000).toFixed(2)}s`;
};

const formatMs = (milliseconds) => {
  if (milliseconds == null) {
    return 'n/a';
  }
  return `${Math.round(milliseconds)}ms`;
};

const summaries = [];

const runPsiRequest = async ({ url: targetUrl, strategy, apiKey: key }) => {
  const params = new URLSearchParams({ url: targetUrl, strategy });
  if (key) {
    params.set('key', key);
  }

  const response = await fetch(`${PSI_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`PSI request failed (${response.status}): ${errorBody}`);
  }

  return response.json();
};

for (const strategy of strategyFlags) {
  try {
    const data = await runPsiRequest({ url, strategy, apiKey });

    const { lighthouseResult } = data;
    if (!lighthouseResult) {
      throw new Error('Missing lighthouseResult in PSI response.');
    }

    const audits = lighthouseResult.audits ?? {};
    const numeric = (id) => audits[id]?.numericValue ?? null;
    const summary = {
      url: lighthouseResult.finalUrl ?? url,
      requestedUrl: lighthouseResult.requestedUrl ?? url,
      strategy,
      fetchedAt: lighthouseResult.fetchTime ?? null,
      performanceScore:
        lighthouseResult.categories?.performance?.score != null
          ? Math.round(lighthouseResult.categories.performance.score * 100)
          : null,
      fcpMs: numeric('first-contentful-paint'),
      lcpMs: numeric('largest-contentful-paint'),
      siMs: numeric('speed-index'),
      ttiMs: numeric('interactive'),
      tbtMs: numeric('total-blocking-time'),
      cls: audits['cumulative-layout-shift']?.numericValue ?? null,
      warnings: lighthouseResult.runWarnings ?? [],
    };

    summary.reportUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(
      summary.requestedUrl,
    )}&form_factor=${strategy}`;

    summaries.push(summary);
  } catch (error) {
    summaries.push({
      strategy,
      error: error?.message ?? String(error),
    });
  }
}

if (outputJson) {
  console.log(JSON.stringify({ url, summaries }, null, 2));
  process.exit(0);
}

const hasApiKey = Boolean(apiKey);
let quotaErrorDetected = false;

for (const summary of summaries) {
  if (summary.error) {
    console.error(`\n${summary.strategy.toUpperCase()} – Error: ${summary.error}`);
    if (/quota/i.test(summary.error ?? '')) {
      quotaErrorDetected = true;
    }
    continue;
  }

  console.log(`\n${summary.strategy.toUpperCase()} – Performance ${summary.performanceScore ?? 'n/a'}`);
  console.log(
    `  FCP: ${formatSeconds(summary.fcpMs)} | LCP: ${formatSeconds(summary.lcpMs)} | Speed Index: ${formatSeconds(
      summary.siMs,
    )}`,
  );
  console.log(
    `  TTI: ${formatSeconds(summary.ttiMs)} | TBT: ${formatMs(summary.tbtMs)} | CLS: ${
      summary.cls == null ? 'n/a' : summary.cls.toFixed(3)
    }`,
  );
  console.log(`  Report: ${summary.reportUrl}`);

  for (const warning of summary.warnings) {
    console.log(`  Warning: ${warning}`);
  }
}

if (quotaErrorDetected && !hasApiKey) {
  console.error('\nTip: Set PSI_API_KEY in your environment to use your own PageSpeed Insights quota.');
}

console.log('');
