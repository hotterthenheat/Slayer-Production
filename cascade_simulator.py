from physics import MicrostructurePhysics
import numpy as np

class HedgingCascade:
    def __init__(self):
        self.physics = MicrostructurePhysics()

    def get_liquidity_coefficient(self, current_min, event_mode):
        """U-Shaped intraday curve + Event Slasher logic."""
        if 570 <= current_min < 630: base = 1.5      # Open
        elif 630 <= current_min < 720: base = 1.0    # Morning
        elif 720 <= current_min < 840: base = 0.4    # Lunch Vacuum
        elif 840 <= current_min < 900: base = 0.9    # Afternoon
        else: base = 1.8                             # Power Hour

        if event_mode == "event": return base * 0.35
        if event_mode == "extreme_event": return base * 0.10
        return max(base, 0.05)

    def run_simulation(self, spot, option_chain, time_struct, event_mode, moc_data):
        """Executes the strict 25-step recursive simulation."""
        current_min = time_struct.tm_hour * 60 + time_struct.tm_min
        liquidity = self.get_liquidity_coefficient(current_min, event_mode)
        
        iteration = 0
        running_path = [spot]
        prev_flow = 0.0
        
        while iteration < 25:
            total_flow = moc_data["delta_dollars"]  # Inject MOC vectors if active
            
            for opt in option_chain:
                # Calculate $d\Delta$ per contract
                greeks = self.physics.calculate_greeks(
                    spot, opt["strike"], opt["t"], opt["sigma"], 0.05, 0.01, opt["type"]
                )
                d_spot = spot - running_path[0]
                d_time = 1.0 / (365.0 * 6.5 * 60.0)
                
                # Delta change formulation
                delta_change = (greeks["gamma"] * d_spot) + (greeks["charm"] * d_time)
                dealer_coeff = -1.0 if opt["type"] == "call" else 1.0
                total_flow += delta_change * opt["oi"] * 100 * dealer_coeff * spot

            # Termination constraints
            if iteration > 0 and abs(total_flow - prev_flow) / (abs(prev_flow) + 1e-5) < 0.05:
                break

            # Market Impact Translation
            scaled_vol = liquidity * 10_000_000
            impact_pct = np.sign(total_flow) * self.physics.Y * 0.20 * np.sqrt(abs(total_flow) / scaled_vol)
            
            if abs(impact_pct) < 0.0002:
                break

            spot = spot * (1.0 + impact_pct)
            running_path.append(spot)
            prev_flow = total_flow
            iteration += 1

        fragility = min(abs(prev_flow) / (liquidity * 5_000_000) * 100, 100)
        return {"path": running_path, "flow": prev_flow, "fragility": fragility}
