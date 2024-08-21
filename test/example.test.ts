import { describe, it, expect } from 'vitest';
import { hello } from '../src/hi';

describe('sum', () => {
    it('should add two numbers', () => {
        const sum = (a: number, b: number) => a + b;
        expect(sum(1, 2)).toBe(3);
        expect(hello(8)).toBe(13);
        console.log(hello(100));
    });
});
