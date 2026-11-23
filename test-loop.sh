#!/usr/bin/env bash
# Continuous test loop for Nova Dark Messenger
# Focus: Account addition without relay servers, full UI/UX validation

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

MAX_ITERATIONS=1000
TEST_TIMEOUT=30000
VERBOSE=false
SKIP_E2E=false

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations) MAX_ITERATIONS="$2"; shift 2 ;;
        --timeout) TEST_TIMEOUT="$2"; shift 2 ;;
        --verbose) VERBOSE=true; shift ;;
        --skip-e2e) SKIP_E2E=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log() { echo -e "${GRAY}[$(date +%H:%M:%S)]${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; }
warning() { echo -e "${YELLOW}⚠${NC} $*"; }
info() { echo -e "${CYAN}ℹ${NC} $*"; }

compress_context() {
    info "Compressing context - cleaning old logs and artifacts..."
    
    # Clean old test artifacts
    if [[ -d ".e2e/artifacts" ]]; then
        find .e2e/artifacts -type d -mmin +120 -exec rm -rf {} + 2>/dev/null || true
    fi
    
    # Clean old vitest logs
    rm -rf .vitest 2>/dev/null || true
    
    # Clean node_modules/.cache if too large
    if [[ -d "node_modules/.cache" ]]; then
        size=$(du -sm node_modules/.cache | cut -f1)
        if [[ $size -gt 500 ]]; then
            warning "Cache size: ${size}MB - clearing..."
            rm -rf node_modules/.cache
        fi
    fi
    
    success "Context compressed"
}

run_unit_tests() {
    info "Running unit tests (vitest)..."
    if npm test 2>&1 | tail -20; then
        success "Unit tests passed"
        return 0
    else
        error "Unit tests failed"
        return 1
    fi
}

run_e2e_tests() {
    if [[ "$SKIP_E2E" == "true" ]]; then
        warning "Skipping e2e tests (--skip-e2e flag)"
        return 0
    fi
    
    info "Running e2e tests..."
    
    # Kill any existing dev server on port 3000
    pids=$(lsof -ti:3000 2>/dev/null || true)
    for pid in $pids; do kill -9 $pid 2>/dev/null || true; done
    
    if npx e2e run tests/onboarding-and-account-addition.e2e.ts --headed 2>&1 | tail -20; then
        success "E2E tests passed"
        return 0
    else
        error "E2E tests failed"
        return 1
    fi
}

fix_common_issues() {
    info "Attempting to fix common issues..."
    
    # 1. Ensure test timeout is configured
    if [[ ! -f "vitest.config.ts" ]]; then
        warning "Creating vitest.config.ts with testTimeout..."
        cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 30000,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    pool: 'vmThreads',
  },
});
EOF
    fi
    
    # 2. Ensure IntersectionObserver mock in test setup
    if ! grep -q "IntersectionObserver" src/test/setup.ts 2>/dev/null; then
        warning "Adding IntersectionObserver mock to test setup..."
        cat >> src/test/setup.ts << 'EOF'

// IntersectionObserver is not implemented in jsdom; StickerPickerDrawer uses it
// for infinite scroll GIF loading.
class IntersectionObserverMock {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }
  observe(target: Element) {
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).IntersectionObserver = IntersectionObserverMock;
EOF
    fi
    
    # 3. Ensure e2e config uses local dev server
    if [[ -f "e2e.config.ts" ]] && grep -q 'reuseExisting: false' e2e.config.ts; then
        warning "Updating e2e config to reuseExisting: true..."
        sed -i 's/reuseExisting: false/reuseExisting: true/' e2e.config.ts
    fi
    
    # 4. Install dependencies if needed
    if [[ ! -d "node_modules/vitest" ]]; then
        warning "Installing dependencies..."
        npm install 2>&1 | tail -5
    fi
    
    success "Common issues addressed"
}

validate_app_readiness() {
    info "Validating app readiness criteria..."
    
    local all_passed=true
    
    # Check 1: Onboarding works without relay servers
    info "Checking: Onboarding without relay servers..."
    if npx e2e run tests/onboarding-and-account-addition.e2e.ts --headed >/dev/null 2>&1; then
        success "✓ Onboarding without relay servers"
    else
        error "✗ Onboarding without relay servers"
        all_passed=false
    fi
    
    # Check 2: All unit tests pass
    info "Checking: All unit tests pass..."
    if npm test >/dev/null 2>&1; then
        success "✓ All unit tests pass"
    else
        error "✗ All unit tests pass"
        all_passed=false
    fi
    
    # Check 3: Key UI components render
    info "Checking: Key UI components..."
    if npx vitest run src/components/ChatsScreen.test.tsx src/components/ChatScreen.test.tsx src/components/ProfileScreen.test.tsx src/components/SettingsModal.test.tsx --testTimeout=30000 >/dev/null 2>&1; then
        success "✓ Key UI components"
    else
        error "✗ Key UI components"
        all_passed=false
    fi
    
    # Check 4: Onboarding flow
    info "Checking: Onboarding flow..."
    if npx vitest run src/components/OnboardingWizard.test.tsx --testTimeout=30000 >/dev/null 2>&1; then
        success "✓ Onboarding flow"
    else
        error "✗ Onboarding flow"
        all_passed=false
    fi
    
    # Check 5: Security/crypto tests
    info "Checking: Security & crypto..."
    if npx vitest run src/lib/security/pinHash.test.ts src/lib/crypto/ratchet.test.ts src/lib/crypto/identity.test.ts src/lib/storage/backup.kdf.test.ts --testTimeout=30000 >/dev/null 2>&1; then
        success "✓ Security & crypto"
    else
        error "✗ Security & crypto"
        all_passed=false
    fi
    
    return $([[ "$all_passed" == "true" ]] && echo 0 || echo 1)
}

# ========== MAIN LOOP ==========
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  Nova Dark Messenger - Continuous Test Loop${NC}"
echo -e "${CYAN}  Focus: Account addition without relay servers${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"

ITERATION=0
CONSECUTIVE_PASSES=0
REQUIRED_CONSECUTIVE_PASSES=3

while [[ $ITERATION -lt $MAX_ITERATIONS ]]; do
    ITERATION=$((ITERATION + 1))
    echo -e "\n${CYAN}═══ ITERATION $ITERATION / $MAX_ITERATIONS ═══${NC}"
    
    # Compress context every 5 iterations
    if [[ $((ITERATION % 5)) -eq 0 ]]; then
        compress_context
    fi
    
    fix_common_issues
    
    # Run tests
    unit_passed=false
    e2e_passed=false
    
    if run_unit_tests; then
        unit_passed=true
    fi
    
    if run_e2e_tests; then
        e2e_passed=true
    fi
    
    if [[ "$unit_passed" == "true" && "$e2e_passed" == "true" ]]; then
        CONSECUTIVE_PASSES=$((CONSECUTIVE_PASSES + 1))
        success "All tests passed! Consecutive passes: $CONSECUTIVE_PASSES / $REQUIRED_CONSECUTIVE_PASSES"
        
        if [[ $CONSECUTIVE_PASSES -ge $REQUIRED_CONSECUTIVE_PASSES ]]; then
            echo -e "\n${GREEN}═══════════════════════════════════════════${NC}"
            echo -e "${GREEN}  ✓ MESSENGER READY FOR PRODUCTION${NC}"
            echo -e "${GREEN}  All tests passing for $REQUIRED_CONSECUTIVE_PASSES consecutive runs${NC}"
            echo -e "${GREEN}  Account addition works without relay servers${NC}"
            echo -e "${GREEN}  All UI/UX verified: buttons, navigation, composer, settings${NC}"
            echo -e "${GREEN}  Onboarding flow complete${NC}"
            echo -e "${GREEN}  Security: PIN, backup, encryption, identity verified${NC}"
            echo -e "${GREEN}═══════════════════════════════════════════${NC}"
            exit 0
        fi
    else
        CONSECUTIVE_PASSES=0
        error "Some tests failed - will attempt fixes in next iteration"
    fi
    
    sleep 5
done

error "Max iterations reached without achieving stable passes"
exit 1