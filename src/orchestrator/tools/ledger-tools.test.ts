import { describe, it, expect } from 'vitest';
import { ledgerTools } from './ledger-tools';

describe('ledger-tools', () => {
  it('exposes Active Dialogue tools (v5.1)', () => {
    expect(ledgerTools).toHaveProperty('ledger_set_active_dialogue');
    expect(ledgerTools).toHaveProperty('ledger_update_active_dialogue');
    expect(ledgerTools).toHaveProperty('ledger_clear_active_dialogue');
  });
});
