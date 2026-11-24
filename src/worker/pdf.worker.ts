import { createDispatcher } from './dispatcher';
import type { WorkerRequest, WorkerResponse } from './protocol';

const workerScope = self;
const dispatch = createDispatcher((message: WorkerResponse, transfer?: Transferable[]) => {
  if (transfer) workerScope.postMessage(message, { transfer });
  else workerScope.postMessage(message);
});

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  dispatch(event.data);
};

workerScope.postMessage({ type: 'ready' });
