import { describe, it, expect, vi } from 'vitest';
import { normalizeWith } from '../src/executor';

// Mock Builder sederhana untuk melacak pemanggilan method
class MockBuilder {
    calledWith: string[] = [];
    filters: string[] = [];

    with(...args: string[]) {
        this.calledWith.push(...args);
        return this;
    }

    where(col: string, val: any) {
        this.filters.push(`${col}=${val}`);
        return this;
    }
}

describe('normalizeWith Unit Test', () => {
    it('should handle simple string input', () => {
        const result = normalizeWith('posts');
        expect(result).toHaveProperty('posts');

        const builder = new MockBuilder();
        result.posts(builder);
        expect(builder.calledWith).toHaveLength(0);
    });

    it('should handle dot notation and group them', () => {
        const result = normalizeWith('posts.comments', 'posts.tags');
        expect(result).toHaveProperty('posts');

        const builder = new MockBuilder();
        result.posts(builder);
        // 'posts' harus memanggil .with() untuk anak-anaknya
        expect(builder.calledWith).toContain('comments');
        expect(builder.calledWith).toContain('tags');
    });

    it('should merge string and object callbacks', () => {
        const result = normalizeWith(
            'posts.comments',
            { posts: (q: any) => q.where('status', 'active') }
        );

        const builder = new MockBuilder();
        result.posts(builder);

        expect(builder.filters).toContain('status=active');
        expect(builder.calledWith).toContain('comments');
    });

    it('should handle deep nesting (3+ levels)', () => {
        const result = normalizeWith('posts.comments.author.profile');
        const builder = new MockBuilder();

        result.posts(builder);
        expect(builder.calledWith).toEqual(['comments.author.profile']);
    });

    it('should not cause infinite loop on duplicate keys', () => {
        // Ini skenario yang sebelumnya bikin crash
        const inputs = ['posts.comments.user', 'posts.comments', 'posts.author'];
        expect(() => normalizeWith(...inputs)).not.toThrow();

        const result = normalizeWith(...inputs);

        const builder = new MockBuilder();
        result.posts(builder);

        expect(builder.calledWith).toEqual(['comments.user', 'comments', 'author']);
    });
});