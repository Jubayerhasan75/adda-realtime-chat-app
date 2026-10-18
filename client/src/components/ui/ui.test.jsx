import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getInitials } from '../../lib/initials.js';
import { Avatar } from './Avatar.jsx';
import { formatCount } from '../../lib/format.js';
import { Badge } from './Badge.jsx';
import { Button } from './Button.jsx';
import { IconButton } from './IconButton.jsx';

describe('getInitials', () => {
  it('uses the first and last word, handling extra spaces and non-Latin names', () => {
    expect(getInitials('Nadia Rahman')).toBe('NR');
    expect(getInitials('  Md   Jubayer  Hossain ')).toBe('MH');
    expect(getInitials('sadia')).toBe('S');
    expect(getInitials('জুবায়ের আহমেদ')).toBe('জআ');
    expect(getInitials('   ')).toBe('?');
  });
});

describe('Avatar', () => {
  it('announces online presence to screen readers', () => {
    render(<Avatar name="Nadia" online />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('formats counts and hides itself at zero', () => {
    expect(formatCount(5)).toBe('5');
    expect(formatCount(100)).toBe('99+');
    const { container } = render(<Badge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Button', () => {
  it('is disabled and busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton label="Close">×</IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
