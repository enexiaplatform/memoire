import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  allowedVariantIds,
  buildCheckoutBody,
  subscriptionStateFor,
  tierForVariantId,
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

  test('active and trialing subscriptions get the variant tier', () => {
    withEnv(env, () => {
      assert.deepEqual(subscriptionStateFor('active', '111'), {
        subscription_status: 'active',
        subscription_tier: 'personal',
      });
      assert.deepEqual(subscriptionStateFor('on_trial', '222'), {
        subscription_status: 'active',
        subscription_tier: 'team',
      });
    });
  });

  // Dunning is not a reason to cut access, and the runbook says so too.
  test('past_due keeps paid access', () => {
    withEnv(env, () => {
      assert.deepEqual(subscriptionStateFor('past_due', '111'), {
        subscription_status: 'active',
        subscription_tier: 'personal',
      });
    });
  });

  // The period is already paid for. Access ends at expiry, not at cancellation.
  test('cancelled keeps the tier but marks the relationship ended', () => {
    withEnv(env, () => {
      assert.deepEqual(subscriptionStateFor('cancelled', '222'), {
        subscription_status: 'cancelled',
        subscription_tier: 'team',
      });
    });
  });

  test('expired, unpaid and paused drop to free', () => {
    withEnv(env, () => {
      for (const status of ['expired', 'unpaid', 'paused']) {
        assert.deepEqual(
          subscriptionStateFor(status, '222'),
          { subscription_status: 'free', subscription_tier: 'free' },
          `${status} must remove paid access`,
        );
      }
    });
  });

  // An unrecognised status must fail closed, not hand out a tier.
  test('unknown, empty and missing statuses fail closed', () => {
    withEnv(env, () => {
      for (const status of ['something_new', '', null, undefined]) {
        assert.deepEqual(subscriptionStateFor(status, '111'), {
          subscription_status: 'free',
          subscription_tier: 'free',
        });
      }
    });
  });

  test('status matching is case and whitespace tolerant', () => {
    withEnv(env, () => {
      assert.deepEqual(subscriptionStateFor(' Active ', '111'), {
        subscription_status: 'active',
        subscription_tier: 'personal',
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
