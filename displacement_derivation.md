# Displacement under constant force — derivation state

## Assumptions
- 1D motion (or each Cartesian component separately); inertial frame
- m, F, x0, v0 real constants; m > 0; t ≥ 0
- Force is time-independent: F(t) ≡ F

## Known
- Newton's second law: m·x''(t) = F
- Initial conditions: x(0) = x0,  x'(0) = v0

## Derived
| Step | Result | Status |
|------|--------|--------|
| 1. Acceleration | a = F/m (constant) | verified (given) |
| 2. First integration | v(t) = v0 + (F/m)t | verified: v(0)=v0, v'(t)=F/m |
| 3. Second integration | **x(t) = x0 + v0·t + (F/(2m))·t²** | verified below |

## Result
$$\boxed{x(t) = x_0 + v_0\,t + \frac{F}{2m}\,t^2}$$

## Verification (all passed)
1. **ODE residual**: m·x''(t) − F ≡ 0  (SymPy, exact)
2. **Initial conditions**: x(0)=x0, x'(0)=v0  (SymPy, exact)
3. **Numeric spot check**: explicit Euler, 200k steps to T=5 s with
   m=1, F=1.7, x0=0.9, v0=2.3 → 33.650106 vs closed form 33.650000
   (diff 1.1e-4, consistent with O(h) Euler truncation)
4. **Special cases**:
   - F→0: x(t)=x0+v0t (free particle) ✓
   - x0=v0=0: x(t)=Ft²/(2m) (rest start) ✓
   - Free particle x0=0, v0=7 at t=2 → 14 ✓
5. **Dimensions**: F/m ∈ [L T⁻²] ⇒ (F/m)t² ∈ [L], v0t ∈ [L], x0 ∈ [L] ✓

## Goals (open)
- (none — derivation complete)
- Possible extensions: relativistic regime, time-varying F(t), drag forces
