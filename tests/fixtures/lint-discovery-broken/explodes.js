// SYNTHETIC fixture: a config module that fails to load. Discovery must
// surface this, never quietly inspect fewer values.
throw new Error('synthetic load failure (lint-discovery fixture)');
