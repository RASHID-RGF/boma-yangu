import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTenantScopeWhere,
  canManageTenantRecord,
  canClaimTenantRecord,
  classifyExistingTenant,
  resolveTenantContact,
} from '../tenant-visibility';

const landlord = { userId: 'landlord-1', role: 'LANDLORD' };
const otherLandlord = { userId: 'landlord-2', role: 'LANDLORD' };
const admin = { userId: 'admin-1', role: 'SUPER_ADMIN' };

/** A tenant occupying a unit on landlord-1's property. */
const onMyProperty = { unitId: 'unit-1', addedById: null, unit: { property: { ownerId: 'landlord-1' } } };
/** A tenant occupying a unit on someone else's property. */
const onOtherProperty = { unitId: 'unit-2', addedById: null, unit: { property: { ownerId: 'landlord-2' } } };
/** Pending record this landlord added (no unit yet). */
const addedByMe = { unitId: null, addedById: 'landlord-1', unit: null };
/** Pending record another landlord added. */
const addedByOther = { unitId: null, addedById: 'landlord-2', unit: null };
/** Profile auto-created when the person registered themselves. */
const selfRegistered = { unitId: null, addedById: null, unit: null };

test('super admin sees every tenant record', () => {
  assert.deepEqual(getTenantScopeWhere(admin), {});
});

test('landlord scope only matches their units and the tenants they added', () => {
  assert.deepEqual(getTenantScopeWhere(landlord), {
    OR: [{ unit: { property: { ownerId: 'landlord-1' } } }, { AND: [{ unitId: null }, { addedById: 'landlord-1' }] }],
  });
});

test('a tenant role never lists records through management endpoints', () => {
  assert.deepEqual(getTenantScopeWhere({ userId: 'tenant-1', role: 'TENANT' }), { id: { in: [] } });
});

test('landlord can manage tenants on their property and their own pending adds', () => {
  assert.equal(canManageTenantRecord(onMyProperty, landlord), true);
  assert.equal(canManageTenantRecord(addedByMe, landlord), true);
});

test('landlord cannot manage other landlords tenants or self-registered profiles', () => {
  assert.equal(canManageTenantRecord(onOtherProperty, landlord), false);
  assert.equal(canManageTenantRecord(addedByOther, landlord), false);
  assert.equal(canManageTenantRecord(selfRegistered, landlord), false);
  assert.equal(canManageTenantRecord(onMyProperty, otherLandlord), false);
});

test('an unowned self-registered profile can be claimed when adding the person', () => {
  assert.equal(canClaimTenantRecord(selfRegistered, landlord), true);
  assert.equal(canClaimTenantRecord(addedByOther, landlord), false);
  assert.equal(canClaimTenantRecord(onOtherProperty, landlord), false);
});

test('classification splits existing records into own / claimable / foreign', () => {
  assert.equal(classifyExistingTenant(onMyProperty, landlord), 'OWN');
  assert.equal(classifyExistingTenant(addedByMe, landlord), 'OWN');
  assert.equal(classifyExistingTenant(selfRegistered, landlord), 'CLAIMABLE');
  assert.equal(classifyExistingTenant(addedByOther, landlord), 'FOREIGN');
  assert.equal(classifyExistingTenant(onOtherProperty, landlord), 'FOREIGN');
  assert.equal(classifyExistingTenant(selfRegistered, admin), 'OWN');
});

test('an email match is a hard duplicate guard with actionable guidance', () => {
  // No match → the person is new.
  assert.deepEqual(resolveTenantContact(null, 'EMAIL', landlord), { action: 'CREATE' });

  // The landlord's own occupant → blocked, pointing at the Change Unit button.
  const named = { ...onMyProperty, firstName: 'RAS', lastName: 'SEE' };
  assert.deepEqual(resolveTenantContact(named, 'EMAIL', landlord), {
    action: 'BLOCK',
    message: 'RAS SEE already has a room. Use "Change Unit" to move them.',
  });

  // Unassigned records (their own pending invite / self-registered profile)
  // are adopted rather than duplicated.
  assert.equal(resolveTenantContact(addedByMe, 'EMAIL', landlord).action, 'ADOPT');
  assert.equal(resolveTenantContact(selfRegistered, 'EMAIL', landlord).action, 'ADOPT');

  // Another landlord's record is never adoptable — but the message says so.
  assert.deepEqual(resolveTenantContact(onOtherProperty, 'EMAIL', landlord), {
    action: 'BLOCK',
    message: 'This person has already been added by another landlord.',
  });
  assert.equal(resolveTenantContact(addedByOther, 'EMAIL', landlord).action, 'BLOCK');
});

test('a shared phone match never blocks adding a tenant (regression)', () => {
  // Households share one phone number: an OCCUPIED record matching by phone
  // must not block the landlord — they get their own record instead. This is
  // the "already has a room. Use Change Unit" dead end that stopped every add.
  assert.deepEqual(resolveTenantContact(onMyProperty, 'PHONE', landlord), { action: 'CREATE' });
  assert.deepEqual(resolveTenantContact(onOtherProperty, 'PHONE', landlord), { action: 'CREATE' });

  // Unassigned records are still reused so re-inviting the same person does
  // not create duplicates.
  assert.equal(resolveTenantContact(addedByMe, 'PHONE', landlord).action, 'ADOPT');
  assert.equal(resolveTenantContact(selfRegistered, 'PHONE', landlord).action, 'ADOPT');

  // Another landlord's pending invite stays theirs — we add our own record.
  assert.equal(resolveTenantContact(addedByOther, 'PHONE', landlord).action, 'CREATE');
});
