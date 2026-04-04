import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:async';
import '../services/api_service.dart';

class ZonesScreen extends StatefulWidget {
  const ZonesScreen({super.key});
  @override
  State<ZonesScreen> createState() => _ZonesScreenState();
}

class _ZonesScreenState extends State<ZonesScreen> {
  List<Map<String, dynamic>> _zones = [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _fetchZones();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _fetchZones());
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  Future<void> _fetchZones() async {
    try {
      final data = await ApiService.get('/admin/zones');
      if (mounted) setState(() { _zones = List<Map<String, dynamic>>.from(data['zones'] ?? []); _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleZoneSignal(String zoneId, String signal, bool current) async {
    await ApiService.patch('/admin/zones/$zoneId/signals', {signal: !current});
    _fetchZones();
  }

  Future<void> _toggleDarkStoreSignal(String dsId, bool current) async {
    await ApiService.patch('/admin/darkstores/$dsId/signals', {'dispatch_outage': !current});
    _fetchZones();
  }

  Color _riskColor(num score) {
    if (score >= 80) return const Color(0xFFEF4444);
    if (score >= 60) return const Color(0xFFF97316);
    if (score >= 40) return const Color(0xFFF59E0B);
    return const Color(0xFF10B981);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Zone Management', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white)),
              Text('Real-time signals & risk scores (auto-refreshes every 30s)', style: GoogleFonts.inter(color: const Color(0xFF94A3B8))),
            ]),
            IconButton(icon: const Icon(Icons.refresh, color: Color(0xFF64748B)), onPressed: _fetchZones),
          ]),
          const SizedBox(height: 32),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else
            Expanded(
              child: SingleChildScrollView(
                child: Column(children: _zones.map(_buildZoneCard).toList()),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _buildZoneCard(Map<String, dynamic> zone) {
    final risk = (zone['current_risk_score'] as num?) ?? 0;
    final lossRatio = (zone['loss_ratio'] as num?) ?? 0.0;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(zone['name'] ?? '', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
            Text('${zone['city']} · ${zone['active_riders'] ?? 0} active riders · ${lossRatio > 0 ? "LR: ${(lossRatio * 100).toStringAsFixed(1)}%" : "LR: 0%"}', style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 13)),
          ])),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: _riskColor(risk).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
            child: Text('Risk: ${risk.toStringAsFixed(0)}', style: GoogleFonts.inter(color: _riskColor(risk), fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 20),
        Text('Signal Toggles', style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: const Color(0xFF64748B))),
        const SizedBox(height: 12),
        Wrap(spacing: 12, runSpacing: 8, children: [
          _SignalChip(label: '🌊 Flood', active: zone['flood_signal'] == true, onToggle: () => _toggleZoneSignal(zone['id'], 'flood_signal', zone['flood_signal'] == true)),
          _SignalChip(label: '🌊 Severe Flood', active: zone['severe_flood_signal'] == true, onToggle: () => _toggleZoneSignal(zone['id'], 'severe_flood_signal', zone['severe_flood_signal'] == true)),
          _SignalChip(label: '⚠️ Unsafe', active: zone['unsafe_signal'] == true, onToggle: () => _toggleZoneSignal(zone['id'], 'unsafe_signal', zone['unsafe_signal'] == true)),
          _SignalChip(label: '🚧 Restriction', active: zone['zone_restriction'] == true, onToggle: () => _toggleZoneSignal(zone['id'], 'zone_restriction', zone['zone_restriction'] == true)),
        ]),
      ]),
    );
  }
}

class _SignalChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onToggle;
  const _SignalChip({required this.label, required this.active, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onToggle,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFFEF4444).withValues(alpha: 0.15) : const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? const Color(0xFFEF4444) : const Color(0xFF334155)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: active ? const Color(0xFFEF4444) : const Color(0xFF475569), shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text(label, style: GoogleFonts.inter(color: active ? const Color(0xFFEF4444) : const Color(0xFF94A3B8), fontSize: 13, fontWeight: FontWeight.w500)),
        ]),
      ),
    );
  }
}
