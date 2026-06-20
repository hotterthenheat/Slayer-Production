class StateEngines:
    def __init__(self):
        pass

    def evaluate_campaign_state(self, oi_history, flow_history, max_capacity):
        """Derives Campaign State Machine transitions via 1st/2nd derivatives."""
        if len(oi_history) < 3: return {"state": "UNKNOWN", "completion": 0.0, "quality": 0.0}

        v_oi = oi_history[-1] - oi_history[-2]
        a_oi = v_oi - (oi_history[-2] - oi_history[-3])
        v_flow = flow_history[-1] - flow_history[-2]
        a_flow = v_flow - (flow_history[-2] - flow_history[-3])

        state = "UNKNOWN"
        if v_flow > 0 and v_oi <= 0: state = "SPECULATIVE"
        elif v_flow > 0 and v_oi > 0 and a_oi <= 0: state = "POSITION BUILDING"
        elif v_flow > 0 and v_oi > 0 and a_oi > 0: state = "ACCUMULATION"
        elif v_oi > 0 and a_oi < 0: state = "EXHAUSTION"
        elif v_oi < 0: state = "UNWINDING"
        
        # If massive flow triggers dealer stress, upgrade state
        if state == "ACCUMULATION" and flow_history[-1] > 50_000_000:
            state = "INSTITUTIONAL CAMPAIGN"

        completion = min((oi_history[-1] / max_capacity) * 100 * (1.15 if a_oi < 0 else 1.0), 99.0)
        
        return {"state": state, "completion": round(completion, 1), "v_flow": v_flow, "a_oi": a_oi}

    def evaluate_event_divergence(self, pre_event_positioning, headline_result):
        """Event Divergence Engine: Flags forced unwinds when positioning and reality collide."""
        pos_skew = 1 if pre_event_positioning == "bullish" else (-1 if pre_event_positioning == "bearish" else 0)
        head_skew = 1 if headline_result == "bullish" else (-1 if headline_result == "bearish" else 0)
        
        divergence = pos_skew - head_skew
        vanna_shock = 1.0
        unwind_risk = "Low"

        if abs(divergence) >= 1 and pos_skew != 0:
            unwind_risk = "Extreme" if abs(divergence) == 2 else "High"
            vanna_shock = 2.5 if unwind_risk == "Extreme" else 1.8

        return {"unwind_risk": unwind_risk, "vanna_shock": vanna_shock, "divergence": divergence}
