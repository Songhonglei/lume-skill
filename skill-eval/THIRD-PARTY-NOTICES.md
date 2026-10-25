# Third-party notices

Original application code is licensed under the MIT License in LICENSE. The following third-party components retain their own terms and notices.

| Component | Version / source | License and retained material |
| --- | --- | --- |
| skill-up | alibaba/skill-up v0.14.0, commit in deploy/toolchain.json | Apache-2.0; licenses/skill-up-Apache-2.0.txt; downloaded binaries verified against pinned SHA256 |
| skill-upper authoring assets | Same upstream commit | Original files, license and per-file SHA256 retained under vendor/skill-upper; only case authoring is invoked by the application |
| Codex CLI | @openai/codex 0.162.1 | Apache-2.0 per npm package metadata; package installation retains its bundled license and notices; deploy/codex/package-lock.json pins package integrity |
| Worker container seccomp profile | openai/codex-security commit 0aeb39d501e03f4f3a9374dbc6d8d44940af0d46 | Apache-2.0; verbatim profile in deploy/worker-seccomp.json, source and hashes in deploy/worker-seccomp.SOURCE.json, license in licenses/codex-security-Apache-2.0.txt; used with all capabilities dropped and no-new-privileges |
| React / React DOM / scheduler | frontend/package-lock.json | MIT; full texts under licenses/ and frontend/public/third-party-licenses.txt |
| yaml | 2.9.1 | ISC; full text under licenses/ and frontend/public/third-party-licenses.txt |
| Python runtime dependencies | uv.lock, deploy/requirements.txt and deploy/worker-requirements.txt | License metadata inventory in docs/verification/local/dependency-licenses.json; pip-installed distributions retain their license files in the runtime environment |
| Build/test tools | frontend/package-lock.json and uv.lock | Development dependencies remain separately identified in lockfiles; they are not bundled as a user's installed development environment |
| Base container images | Dockerfile and compose.yaml | Official Python, Node and PostgreSQL images retain their component licenses; container builds and redistribution are pending acceptance |

The source Worker ZIP contains the application modules and vendored authoring assets, with their licenses. It does not include a Python/Node runtime or model credentials; the installer downloads dependencies into the private application directory. The installer preserves licenses delivered by those packages.

Upstream skill-upper references describe broader capabilities than this application exposes. Observation capture, self-improvement, other engines and plugin installation are not enabled by copying those reference documents.
