// ─── Shared domain types ───────────────────────────────────────────────────────
// One module per domain. Consumers import from this barrel (or directly from a
// domain module when they only need one).

export * from './user.types';
export * from './post.types';
export * from './comment.types';
export * from './community.types';
export * from './event.types';
export * from './game.types';
export * from './wallet.types';
export * from './notification.types';
export * from './feed.types';
export * from './progression.types';
export * from './sockets.types';
export * from './navigation.types';