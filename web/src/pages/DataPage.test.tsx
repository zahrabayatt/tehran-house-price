import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import funnel from '../../public/data/funnel.json';
import profile from '../../public/data/profile.json';
import { DataPage } from './DataPage';

describe('DataPage', () => {
  it('names the source, license, period and what kind of data it is', () => {
    render(<DataPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Where the numbers come from' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'divarofficial/real_estate_ads' });
    expect(link.getAttribute('href')).toBe('https://huggingface.co/datasets/divarofficial/real_estate_ads');
    expect(screen.getByText('ODbL')).toBeTruthy();
    expect(screen.getByText('May to December 2024')).toBeTruthy();
    expect(screen.getByText('Advertised, not transacted')).toBeTruthy();
  });

  it('lists every funnel step with its real row count, ending at the training set', () => {
    render(<DataPage />);
    const list = screen.getByRole('list', { name: 'Cleaning funnel' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(funnel.length);
    expect(items[0].textContent).toContain('1,000,000');
    expect(items[1].textContent).toContain('190,904');
    const last = funnel[funnel.length - 1];
    expect(last.rows).toBe(profile.row_counts.clean);
    expect(items[items.length - 1].textContent).toContain('81,603');
  });

  it('shows one row per field with its measured missing share', () => {
    render(<DataPage />);
    const table = screen.getByRole('table', { name: 'Fields used' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(profile.fields.length);
    const area = rows.find((r) => r.textContent?.includes('building_size'))!;
    expect(area.textContent).toContain('0.001%');
    const price = rows.find((r) => r.textContent?.includes('price_value'))!;
    expect(price.textContent).toContain('0%');
    expect(price.textContent).not.toContain('0.001%');
  });

  it('shows no bracketed placeholders or empty numbers', () => {
    const { container } = render(<DataPage />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\[[a-z ]+\]/i);
    expect(text).not.toMatch(/NaN|undefined|null/);
  });

  it('states the limitations in plain words', () => {
    render(<DataPage />);
    expect(screen.getByRole('heading', { name: 'Limitations' })).toBeTruthy();
    expect(screen.getAllByText(/December 2024/).length).toBeGreaterThan(0);
  });
});
