import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceLink } from '../components/CodeWalkthrough';
import { inputs } from '../lab/testData';
import { Lab } from './Lab';

/** A fake animation clock: frames run when the test says so, and cancelled frames never run. */
function fakeFrames() {
  let next = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const request = vi.fn((cb: FrameRequestCallback) => {
    pending.set(next, cb);
    return next++;
  });
  const cancel = vi.fn((id: number) => void pending.delete(id));
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    request,
    cancel,
    pending: () => pending.size,
    /** Run every waiting frame, 40 ms apart. */
    tick(times = 1) {
      for (let i = 0; i < times; i++) {
        now += 40;
        const run = [...pending.entries()];
        pending.clear();
        act(() => run.forEach(([, cb]) => cb(now)));
      }
    },
  };
}

const gotoStep = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }));
const replay = () => screen.getByTestId('replay-label').textContent ?? '';

describe('the animation', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('advances one animation frame at a time and stops when the run ends', () => {
    const frames = fakeFrames();
    render(<Lab inputs={inputs} />);
    gotoStep('Gradient descent');
    fireEvent.change(screen.getByLabelText('Iterations'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(replay()).toBe('Replay: iteration 0 of 30');
    frames.tick(3);
    expect(replay()).not.toBe('Replay: iteration 0 of 30');
    frames.tick(60);
    expect(replay()).toBe('Replay: iteration 30 of 30');
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    // Once the run is over nothing keeps asking for frames.
    expect(frames.pending()).toBe(0);
  });

  it('cancels the pending frame when the page unmounts', () => {
    const frames = fakeFrames();
    const { unmount } = render(<Lab inputs={inputs} />);
    gotoStep('Gradient descent');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    frames.tick(2);
    expect(frames.pending()).toBe(1);
    const before = frames.request.mock.calls.length;
    unmount();
    expect(frames.cancel).toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
    frames.tick(3);
    expect(frames.request.mock.calls.length).toBe(before);
  });

  it('stops asking for frames while paused', () => {
    const frames = fakeFrames();
    render(<Lab inputs={inputs} />);
    gotoStep('Gradient descent');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    frames.tick(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.pending()).toBe(0);
    const at = replay();
    frames.tick(5);
    expect(replay()).toBe(at);
  });

  it('jumps to the end at once when the person prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    const frames = fakeFrames();
    render(<Lab inputs={inputs} />);
    gotoStep('Gradient descent');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(replay()).toBe('Replay: iteration 200 of 200');
    expect(frames.request).not.toHaveBeenCalled();
  });
});

describe('code links', () => {
  const block = { name: 'x', file: 'training/model.py', startLine: 10, lines: ['a', 'b', 'c'] };
  it('exist only when the repository address is set', () => {
    expect(sourceLink('', block)).toBeNull();
    const base = `https://github.com/me/repo/blob/${__COMMIT__}/training/model.py#L10-L12`;
    expect(sourceLink('https://github.com/me/repo', block)).toBe(base);
    expect(sourceLink('https://github.com/me/repo/', block)).toBe(base);
  });
  it('point at a commit, not a branch that moves', () => {
    expect(__COMMIT__).toMatch(/^[0-9a-f]{40}$/);
    expect(sourceLink('https://github.com/me/repo', block)).not.toContain('/blob/main/');
  });
});
