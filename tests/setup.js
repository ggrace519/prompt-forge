// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom';
// Auto-cleanup rendered components after every test
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
