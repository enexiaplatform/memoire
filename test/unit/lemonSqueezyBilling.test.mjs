import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  allowedVariantIds,
  buildCheckoutBody,
  purchasablePlans,
  subscriptionStateFor,
  tierForVariantId,
  variantIdForPlan,
  readRawBody,
  verifyWebhookSignature,
} from '../../api/_lemonsqueezy.js';

const SECRET = 'test-webhook-secret';
const sign = (body, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const withEnv = (values, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('Lemon Squeezy webhook signature', () => {
  test('accepts a signature produced with the shared secret', () => {
    const body = JSON.stringify({ meta: { event_name: 'subscription_created' } });
    assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  });

  test('rejects a signature made with a different secret', () => {
    const body = '{"ok":true}';
    assert.equal(verifyWebhookSignature(body, sign(body, 'other-secret'), SECRET), false);
  });

  test('rejects a body altered after signing', () => {
    const signature = sign('{"amount":10}');
    assert.equal(verifyWebhookSignature('{"amount":1000}', signature, SECRET), false);
  });

  // A forged header should never reach the HMAC comparison as a length match.
  test('rejects malformed, empty and missing signatures', () => {
    const body = '{"ok":true}';
    for (const signature of ['', 'not-hex', 'ff', undefined, null]) {
      assert.equal(verifyWebhookSignature(body, signature, SECRET), false);
    }
  });

  test('rejects everything when no secret is configured', () => {
    const body = '{"ok":true}';
    assert.equal(verifyWebhookSignature(body, sign(body), ''), false);
    assert.equal(verifyWebhookSignature(body, sign(body), undefined), false);
  });
});

describe('subscription status maps to entitlement', () => {
  const env = {
    LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111',
    LEMONSQUEEZY_TEAM_VARIANT_ID: '222',
  };

  // The whole Lemon Squeezy `attributes` object is passed, not a status and a
  // variant id, because a subscription contributes three columns now and the
  // trial date is one of them.
  const stateOf = (attributes) => subscriptionStateFor(attributes);

  test('an active subscription gets the variant tier and no trial date', () => {
    withEnv(env, () => {
      assert.deepEqual(stateOf({ status: 'active', variant_id: '111' }), {
        subscription_status: 'active',
        subscription_tier: 'personal',
        subscription_trial_ends_at: null,
      });
    });
  });

  // on_trial is deliberately not folded into 'active': both have full access,
  // but only one of them is about to have a card charged.
  test('a trial is entitled but is reported as a trial, with its end date', () => {
    withEnv(env, () => {
      assert.deepEqual(
        stateOf({ status: 'on_trial', variant_id: '222', trial_ends_at: '2026-08-20T00:00:00Z' }),
        {
          subscription_status: 'on_trial',
          subscription_tier: 'team',
          subscription_trial_ends_at: '2026-08-20T00:00:00Z',
        },
      );
    });
  });

  // Dunning is not a reason to cut access, and the runbook says so too.
  test('past_due keeps paid access', () => {
    withEnv(env, () => {
      assert.deepEqual(stateOf({ status: 'past_due', variant_id: '111' }), {
        subscription_status: 'active',
        subscription_tier: 'personal',
        subscription_trial_ends_at: null,
      });
    });
  });

  // The period is already paid for. Access ends at expiry, not at cancellation.
  test('cancelled keeps the tier but marks the relationship ended', () => {
    withEnv(env, () => {
      assert.deepEqual(stateOf({ status: 'cancelled', variant_id: '222' }), {
        subscription_status: 'cancelled',
        subscription_tier: 'team',
        subscription_trial_ends_at: null,
      });
    });
  });

  // Cancelling mid-trial leaves the date set, and it is what tells the operator
  // when access actually stops.
  test('cancelling during a trial carries the trial end date through', () => {
    withEnv(env, () => {
      assert.equal(
        stateOf({ status: 'cancelled', variant_id: '111', trial_ends_at: '2026-08-18T00:00:00Z' })
          .subscription_trial_ends_at,
        '2026-08-18T00:00:00Z',
      );
    });
  });

  test('expired, unpaid and paused drop to free', () => {
    withEnv(env, () => {
      for (const status of ['expired', 'unpaid', 'paused']) {
        assert.deepEqual(
          stateOf({ status, variant_id: '222' }),
          { subscription_status: 'free', subscription_tier: 'free', subscription_trial_ends_at: null },
          `${status} must remove paid access`,
        );
      }
    });
  });

  // An unrecognised status must fail closed, not hand out a tier.
  test('unknown, empty and missing statuses fail closed', () => {
    withEnv(env, () => {
      for (const status of ['something_new', '', null, undefined]) {
        assert.deepEqual(stateOf({ status, variant_id: '111' }), {
          subscription_status: 'free',
          subscription_tier: 'free',
          subscription_trial_ends_at: null,
        });
      }
      assert.deepEqual(stateOf(), {
        subscription_status: 'free',
        subscription_tier: 'free',
        subscription_trial_ends_at: null,
      });
    });
  });

  test('status matching is case and whitespace tolerant', () => {
    withEnv(env, () => {
      assert.deepEqual(stateOf({ status: ' Active ', variant_id: '111' }), {
        subscription_status: 'active',
        subscription_tier: 'personal',
        subscription_trial_ends_at: null,
      });
    });
  });
});

describe('variant to tier', () => {
  test('the team variant is the only route to the team tier', () => {
    withEnv({ LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: '222' }, () => {
      assert.equal(tierForVariantId('222'), 'team');
      assert.equal(tierForVariantId(222), 'team', 'numeric ids from the webhook must match too');
      assert.equal(tierForVariantId('111'), 'personal');
      assert.equal(tierForVariantId('999'), 'personal');
    });
  });

  // Guards a real failure shape: with the team variant unset, an id of
  // undefined or '' must not compare equal and promote a user to team.
  test('an unconfigured team variant never grants the team tier', () => {
    withEnv({ LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: undefined }, () => {
      for (const id of ['', undefined, null, 'undefined']) {
        assert.equal(tierForVariantId(id), 'personal');
      }
    });
  });
});

describe('allowed variants', () => {
  test('only configured variants are sellable', () => {
    withEnv({ LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: '222' }, () => {
      assert.deepEqual(allowedVariantIds(), ['111', '222']);
    });
  });

  test('unset variants leave nothing purchasable', () => {
    withEnv({ LEMONSQUEEZY_PERSONAL_VARIANT_ID: undefined, LEMONSQUEEZY_TEAM_VARIANT_ID: undefined }, () => {
      assert.deepEqual(allowedVariantIds(), []);
    });
  });
});

describe('checkout body', () => {
  test('carries the account link Lemon Squeezy sends back on every webhook', () => {
    const body = buildCheckoutBody({
      storeId: 42,
      variantId: 111,
      userId: 'user-abc',
      email: 'seller@example.com',
      redirectUrl: 'https://app.example.com/app/capture?upgrade=success',
    });

    assert.equal(body.data.attributes.checkout_data.custom.user_id, 'user-abc');
    assert.equal(body.data.attributes.checkout_data.email, 'seller@example.com');
    assert.equal(
      body.data.attributes.product_options.redirect_url,
      'https://app.example.com/app/capture?upgrade=success',
    );
    // The JSON:API resource identifiers must be strings or the API rejects them.
    assert.equal(body.data.relationships.store.data.id, '42');
    assert.equal(body.data.relationships.variant.data.id, '111');
  });

  test('an unknown email is omitted rather than sent empty', () => {
    const body = buildCheckoutBody({ storeId: '1', variantId: '2', userId: 'u', email: '', redirectUrl: 'https://x/y' });
    assert.equal(body.data.attributes.checkout_data.email, undefined);
  });
});

describe('plan to variant resolution', () => {
  // The browser holds no variant id - there is no VITE_* billing key to put one
  // in - so it names a plan and the server decides what that costs.
  test('resolves each plan to its configured variant', () => {
    withEnv(
      { LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: '222' },
      () => {
        assert.equal(variantIdForPlan('personal'), '111');
        assert.equal(variantIdForPlan('team'), '222');
      },
    );
  });

  test('refuses a plan name the store has no variant for', () => {
    withEnv(
      { LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: undefined },
      () => {
        assert.equal(variantIdForPlan('team'), null);
        assert.equal(variantIdForPlan('enterprise'), null);
        assert.equal(variantIdForPlan(undefined), null);
      },
    );
  });

  test('offers only the plans that are actually configured', () => {
    withEnv(
      { LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: undefined },
      () => {
        assert.deepEqual(purchasablePlans(), ['personal']);
      },
    );
    withEnv(
      { LEMONSQUEEZY_PERSONAL_VARIANT_ID: undefined, LEMONSQUEEZY_TEAM_VARIANT_ID: undefined },
      () => {
        assert.deepEqual(purchasablePlans(), []);
      },
    );
  });

  // A resolved variant is still put through the allow-list in api/billing.ts,
  // so this pair is what keeps an unconfigured plan unbuyable end to end.
  test('a resolved variant is one the allow-list already contains', () => {
    withEnv(
      { LEMONSQUEEZY_PERSONAL_VARIANT_ID: '111', LEMONSQUEEZY_TEAM_VARIANT_ID: '222' },
      () => {
        assert.equal(allowedVariantIds().includes(variantIdForPlan('personal')), true);
      },
    );
  });
});

/**
 * The webhook body is read off a stream and the signature is checked over the
 * exact bytes Lemon Squeezy signed, so how those bytes are reassembled is part
 * of whether a paying customer gets what they paid for.
 */
describe('raw webhook body reassembly', () => {
  // A stream that hands out exactly the chunks it is given, so a character can
  // be split across two of them the way a real socket splits one.
  const streamOf = (chunks) => {
    const listeners = new Map();
    const emitter = {
      on(event, handler) {
        listeners.set(event, handler);
        return emitter;
      },
      destroy() {
        emitter.destroyed = true;
      },
      destroyed: false,
    };
    queueMicrotask(() => {
      for (const chunk of chunks) {
        if (emitter.destroyed) return;
        listeners.get('data')?.(chunk);
      }
      if (!emitter.destroyed) listeners.get('end')?.();
    });
    return emitter;
  };

  test('a multi-byte character split across two chunks survives', async () => {
    const body = JSON.stringify({ name: 'Trần Quốc Bảo', amount: '€49' });
    const bytes = Buffer.from(body, 'utf8');
    // Split inside the three bytes of "ầ" - decoding each chunk on its own
    // would turn it into replacement characters and break the signature.
    const split = bytes.indexOf(Buffer.from('ầ', 'utf8')) + 1;

    const raw = await readRawBody(streamOf([bytes.subarray(0, split), bytes.subarray(split)]));

    assert.equal(raw, body);
    assert.equal(verifyWebhookSignature(raw, sign(body), SECRET), true);
  });

  test('a body over the size ceiling is refused rather than truncated', async () => {
    const oversized = Buffer.alloc(1_000_001, 'a');
    await assert.rejects(
      readRawBody(streamOf([oversized])),
      /too large/i,
    );
  });
});
