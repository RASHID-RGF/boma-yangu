import test from 'node:test';
import assert from 'node:assert/strict';
import { isVacantUnitStatus, normalizeUnitStatus } from '@/lib/utils/room-assignment';

test('newly created units are treated as vacant even when status is missing or blank', () => {
  assert.equal(normalizeUnitStatus('VACANT'), 'VACANT');
  assert.equal(normalizeUnitStatus(''), 'VACANT');
  assert.equal(normalizeUnitStatus(null), 'VACANT');
  assert.equal(normalizeUnitStatus(undefined), 'VACANT');
  assert.equal(isVacantUnitStatus('VACANT'), true);
  assert.equal(isVacantUnitStatus(''), true);
  assert.equal(isVacantUnitStatus(null), true);
  assert.equal(isVacantUnitStatus(undefined), true);
  assert.equal(isVacantUnitStatus('OCCUPIED'), false);
});
