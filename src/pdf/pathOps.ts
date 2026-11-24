import type { PathCmd } from '@engine';
import { fmt } from './num';

export function pathToOps(path: readonly PathCmd[], precision: number): string {
  const ops: string[] = [];
  for (const command of path) {
    if (command.op === 'M') {
      ops.push(`${fmt(command.x, precision)} ${fmt(command.y, precision)} m`);
    } else if (command.op === 'C') {
      ops.push(
        `${fmt(command.x1, precision)} ${fmt(command.y1, precision)} ` +
        `${fmt(command.x2, precision)} ${fmt(command.y2, precision)} ` +
        `${fmt(command.x, precision)} ${fmt(command.y, precision)} c`,
      );
    } else {
      ops.push('h');
    }
  }
  return ops.join(' ');
}
