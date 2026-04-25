# Pull Request Checklist

Use this checklist before opening a PR in either repository:

- `susee`: <https://github.com/phothinmg/susee>
- `suseejs`: <https://github.com/phothinmg/suseejs>

## Scope and intent

- [ ] The PR solves one clear problem.
- [ ] The title and description explain the change and why it is needed.
- [ ] Out-of-scope changes were avoided.

## Code quality

- [ ] New code follows existing style and patterns.
- [ ] Error handling and edge cases were considered.
- [ ] Any config/CLI/API change remains consistent across code and docs.

## Testing

- [ ] Existing tests still pass.
- [ ] New tests were added for changed behavior.
- [ ] Manual verification was done for affected CLI or build output paths.

## Documentation

- [ ] Relevant docs pages were updated.
- [ ] Examples still match current behavior and option names.

## Release impact

- [ ] Breaking changes are clearly called out.
- [ ] Consumer impact is documented (especially for `@suseejs/*` packages).

## Final sanity check

- [ ] Branch is up to date with target base branch.
- [ ] Commit messages are clear.
- [ ] Dependencies were installed with `npm` (not mixed package managers).
- [ ] `npm run hooks:install` was run when the repository provides it.
- [ ] PR is ready for review.

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Contributing to Susee](/guide/contribution-susee)
- [Contributing to Core Build Packages](/guide/contribution-core-build-packages)
