import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import funnel from '../../public/data/funnel.json';
import listings from '../../public/data/listings.json';
import summary from '../../public/data/data-summary.json';
import { DataPage, funnelSteps } from './DataPage';

const page = () => render(<MemoryRouter><DataPage /></MemoryRouter>);

describe('DataPage', () => {
  it('opens with the four facts', () => {
    page();
    expect(screen.getByRole('heading', { level: 1, name: 'The data behind the estimate' })).toBeTruthy();
    expect(screen.getByText('apartment ads used').previousElementSibling?.textContent).toBe('81,603');
    expect(screen.getByText('May to Dec 2024')).toBeTruthy();
    expect(screen.getByText(String(summary.neighborhoodsWithPrice))).toBeTruthy();
    expect(screen.getByText('Asking prices')).toBeTruthy();
  });

  it('shows the cleaning in five plain steps with real counts', () => {
    const steps = funnelSteps();
    expect(steps.map((s) => s.rows)).toEqual([1_000_000, 190_904, 84_584, 83_355, funnel[funnel.length - 1].rows]);
    page();
    const items = within(screen.getByRole('list', { name: 'Cleaning funnel' })).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[4].textContent).toContain('81,603');
  });

  it('states the typical miss from the model and pages through real test ads', () => {
    page();
    expect(screen.getByTestId('typical-miss').textContent).toContain('15.6%');
    const table = screen.getByRole('table', { name: 'Real test ads' });
    const first = within(table).getAllByRole('row')[1].textContent;
    expect(first).toContain(listings[0].neighborhood);
    fireEvent.click(screen.getByRole('button', { name: 'Show other ads' }));
    expect(within(table).getAllByRole('row')[1].textContent).toContain(listings[5].neighborhood);
  });

  it('never names an evaluation metric', () => {
    const { container } = page();
    expect(container.textContent).not.toMatch(/\b(MSE|RMSE|MAE|Accuracy|R2)\b/);
  });
});
