import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandRegistry, matchCommands } from '../../src/utils/commandRegistry.ts';

const ids = (query) => matchCommands(query, commandRegistry, 20).map((command) => command.id);

describe('commands from the search bar', () => {
  test('the everyday actions are one phrase away', () => {
    assert.equal(ids('add lead')[0], 'add-lead');
    assert.ok(ids('capture meeting').includes('capture-meeting'));
    assert.ok(ids('overdue payments').includes('overdue-payments'));
    assert.ok(ids('deals without champion').includes('deals-no-champion'));
    assert.ok(ids('what changed this week').includes('what-changed'));
    assert.ok(ids('leads due for revisit').includes('leads-revisit'));
    assert.ok(ids('going silent').includes('deals-silent'));
  });

  test('a prefix is enough, and "add" offers every create command', () => {
    assert.ok(ids('pay').includes('overdue-payments'));
    const creates = matchCommands('add', commandRegistry, 20).map((command) => command.kind);
    assert.ok(creates.length >= 2);
  });

  test('a customer name matches no command', () => {
    assert.deepEqual(ids('Rohto'), []);
  });

  test('accents and case do not matter', () => {
    assert.ok(ids('ÂDD LÉAD').includes('add-lead'));
  });

  test('every command lands on a route the app actually serves', () => {
    const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    for (const command of commandRegistry) {
      const path = command.to.split('?')[0].replace('/app/', '');
      assert.match(app, new RegExp(`<Route path="${path}"`), `${command.id} points at /app/${path}, which has no route`);
    }
  });

  test('every filter a command asks for is a filter its page accepts', () => {
    const opportunities = readFileSync(new URL('../../src/features/opportunities/OpportunitiesPage.tsx', import.meta.url), 'utf8');
    const leads = readFileSync(new URL('../../src/utils/leadQueue.ts', import.meta.url), 'utf8');
    for (const command of commandRegistry) {
      const query = new URLSearchParams(command.to.split('?')[1] || '');
      if (command.to.startsWith('/app/opportunities') && query.get('filter')) {
        assert.ok(opportunities.includes(`case '${query.get('filter')}':`), `${command.id}: Opportunities has no ${query.get('filter')} filter`);
      }
      if (command.to.startsWith('/app/leads') && query.get('state')) {
        assert.ok(leads.includes(`'${query.get('state')}'`), `${command.id}: Leads has no ${query.get('state')} state`);
      }
    }
  });
});
