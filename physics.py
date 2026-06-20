import numpy as np
from scipy.stats import norm
import time

class MicrostructurePhysics:
    def __init__(self):
        self.Y = 0.0001  # Market resilience constant (Square-root impact factor)
        self.moc_imbalance_threshold = 500_000_000

    def calculate_greeks(self, S, K, t, sigma, r, q, option_type="call"):
        if t <= 0: t = 1e-5
        if sigma <= 0: sigma = 1e-4

        d1 = (np.log(S / K) + (r - q + 0.5 * sigma ** 2) * t) / (sigma * np.sqrt(t))
        d2 = d1 - sigma * np.sqrt(t)
        
        n_prime_d1 = norm.pdf(d1)
        N_d1 = norm.cdf(d1)
        
        # Base Delta & Gamma
        delta = np.exp(-q * t) * N_d1 if option_type == "call" else np.exp(-q * t) * (N_d1 - 1)
        gamma = (np.exp(-q * t) * n_prime_d1) / (S * sigma * np.sqrt(t))
        
        # Second-Order (Vanna, Charm)
        vanna = -np.exp(-q * t) * n_prime_d1 * (d2 / sigma)
        charm = q * np.exp(-q * t) * N_d1 - np.exp(-q * t) * n_prime_d1 * ((r - q) / (sigma * np.sqrt(t)) - d2 / (2 * t))
        if option_type == "put":
            charm = -q * np.exp(-q * t) * (1 - N_d1) - np.exp(-q * t) * n_prime_d1 * ((r - q) / (sigma * np.sqrt(t)) - d2 / (2 * t))

        # Third-Order (Speed, Color)
        speed = -(gamma / S) * (1 + (d1 / (sigma * np.sqrt(t))))
        color = -(np.exp(-q * t) * n_prime_d1 / (2 * S * t * sigma * np.sqrt(t))) * (1 + d1 * ((r - q) / (sigma * np.sqrt(t)) - d2 / (2 * t)))

        return {"delta": delta, "gamma": gamma, "vanna": vanna, "charm": charm, "speed": speed, "color": color}

    def process_tier1_liquidity(self, l2_bids, l2_asks):
        """Processes Level 2 Order Book Depth for base liquidity scaling."""
        if not l2_bids or not l2_asks: return 50.0
        bid_depth, ask_depth = 0.0, 0.0
        for i in range(min(5, len(l2_bids), len(l2_asks))):
            weight = 0.85 ** i
            bid_depth += l2_bids[i]["size"] * weight
            ask_depth += l2_asks[i]["size"] * weight
        denom = bid_depth + ask_depth
        return ((bid_depth - ask_depth) / denom + 1.0) * 50.0 if denom > 0 else 50.0

    def process_moc_imbalance(self, imbalance_size, side, current_min):
        """Tier 1 MOC processing active strictly between 15:50 and 16:00 EST."""
        if current_min < 950 or current_min > 960 or imbalance_size < self.moc_imbalance_threshold:
            return {"active": False, "delta_dollars": 0.0, "multiplier": 1.0}
        side_mult = 1.0 if side == "buy" else (-1.0 if side == "sell" else 0.0)
        return {
            "active": True, 
            "delta_dollars": imbalance_size * side_mult, 
            "multiplier": 1.0 + ((current_min - 950) / 10.0)
        }
