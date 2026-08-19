import { COMMAND_SPECS } from './command-types.js';

// "No UI handler may mutate semantic state directly. Every semantic change
// dispatches one command to reducer(state, command)." (T06, T-REQ-005) —
// validateCommand is the gate every dispatched command passes through first.
export function validateCommand(command) {
  const errors = [];
  if (!command || typeof command !== 'object') return { ok: false, errors: ['command is not an object'] };

  const spec = COMMAND_SPECS[command.type];
  if (!spec) {
    return { ok: false, errors: [`unknown command type: ${command.type}`] };
  }
  for (const field of spec.requiredFields) {
    if (!(field in command) || command[field] === undefined) {
      errors.push(`${command.type} is missing required field "${field}"`);
    }
  }
  return { ok: errors.length === 0, errors };
}
