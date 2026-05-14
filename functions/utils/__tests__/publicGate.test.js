import { describe, expect, it } from 'vitest';

import {
  getPublicDataGateResponse,
  isPublicDataEnabled,
} from '../publicGate.js';

describe('public data gate', () => {
  it('fails closed when the publish flag is unset', () => {
    expect(isPublicDataEnabled({})).toBe(false);
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: '' })).toBe(
      false
    );
  });

  it('enables public data only for explicit truthy values', () => {
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: 'true' })).toBe(
      true
    );
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: '1' })).toBe(
      true
    );
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: 'yes' })).toBe(
      true
    );
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: 'on' })).toBe(
      true
    );

    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: 'false' })).toBe(
      false
    );
    expect(isPublicDataEnabled({ PUBLIC_DATA_PUBLISH_ENABLED: '0' })).toBe(
      false
    );
  });

  it('returns a retryable gate response when public data is disabled', async () => {
    const response = getPublicDataGateResponse({});

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Retry-After')).toBe('3600');

    const payload = await response.json();
    expect(payload).toEqual({
      error: 'Public data is not yet published',
      message: 'Event data will be available once publishing is enabled.',
    });
  });

  it('does not block when public data is explicitly enabled', () => {
    expect(
      getPublicDataGateResponse({ PUBLIC_DATA_PUBLISH_ENABLED: 'true' })
    ).toBeNull();
  });
});
