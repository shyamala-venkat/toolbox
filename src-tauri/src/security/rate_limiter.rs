//! Token-bucket rate limiter.
//!
//! Phase 1 stub: just enough surface for callers to compile against. The
//! production implementation will land in a later phase and will use
//! `std::sync::Mutex` over a small struct (no async, sub-microsecond cost).
//!
//! Concurrency model (planned): one bucket per `(scope, key)`, all stored in
//! a `DashMap`. `try_acquire` is the only mutation entry point and is
//! lock-free on the read path.

#![allow(dead_code)]

use std::time::Duration;

#[derive(Debug, Clone)]
pub struct TokenBucketConfig {
    pub capacity: u32,
    pub refill_per_second: f64,
}

impl TokenBucketConfig {
    pub const fn new(capacity: u32, refill_per_second: f64) -> Self {
        Self {
            capacity,
            refill_per_second,
        }
    }
}

#[derive(Debug)]
pub struct TokenBucket {
    #[allow(dead_code)]
    config: TokenBucketConfig,
}

impl TokenBucket {
    pub fn new(config: TokenBucketConfig) -> Self {
        Self { config }
    }

    /// Attempt to acquire `n` tokens. Always succeeds in the stub.
    pub fn try_acquire(&self, _n: u32) -> bool {
        true
    }

    /// Time until the next token is available. Always zero in the stub.
    pub fn time_until_next(&self) -> Duration {
        Duration::ZERO
    }
}
