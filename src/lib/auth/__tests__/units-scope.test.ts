import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnitScopeWhere } from '../unit-scope';

test('super admin sees all units without a property owner filter', () => {
  assert.deepEqual(getUnitScopeWhere('SUPER_ADMIN', 'user-1'), {});
});

test('landlord scope narrows units to their own properties through a relation filter', () => {
  assert.deepEqual(getUnitScopeWhere('LANDLORD', 'user-1'), {
    property: { is: { ownerId: 'user-1' } },
  });
});
