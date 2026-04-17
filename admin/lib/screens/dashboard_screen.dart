import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _stats;
  List<dynamic>? _predictions;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchStats();
    _fetchPredictions();
  }

  Future<void> _fetchStats() async {
    try {
      final data = await ApiService.get('/admin/dashboard');
      if (mounted) setState(() { _stats = data; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchPredictions() async {
    try {
      final data = await ApiService.get('/admin/weekly-predictions');
      if (mounted) setState(() { _predictions = data; });
    } catch (e) {
      print('Failed to fetch predictions: $e');
    }
  }

  Future<void> _simulateStress() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.post('/admin/simulate-stress', {'days': 14});
      if (mounted) {
        setState(() => _loading = false);
        showDialog(context: context, builder: (_) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: Text('Monsoon Simulation (14 Days)', style: GoogleFonts.inter(color: Colors.white)),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Simulated Days: ${res['simulated_days']}', style: const TextStyle(color: Colors.white70)),
            Text('Affected Active Riders: ${res['affected_riders']}', style: const TextStyle(color: Colors.white70)),
            Text('Total Projected Payout: ₹${res['total_simulated_payout']}', style: const TextStyle(color: Colors.redAccent)),
            Text('Projected Loss Ratio: ${((res['projected_loss_ratio'] ?? 0) * 100).toStringAsFixed(1)}%', style: const TextStyle(color: Colors.white)),
            Text('Projected BCR: ${(res['projected_bcr'] ?? 0).toStringAsFixed(2)}x', style: const TextStyle(color: Colors.white)),
            Text('Projected Reserve Balance: ₹${res['projected_reserve_balance']}', style: TextStyle(color: (res['projected_reserve_balance'] ?? 0) >= 0 ? Colors.greenAccent : Colors.orangeAccent)),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close', style: TextStyle(color: Colors.blue)))],
        ));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sim failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Dashboard', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white)),
                  Text('ShiftSure platform overview', style: GoogleFonts.inter(color: const Color(0xFF94A3B8))),
                ]),
                Row(children: [
                  FilledButton.icon(
                    onPressed: _loading ? null : _simulateStress,
                    icon: const Icon(Icons.storm, color: Colors.white, size: 18),
                    label: const Text('Monsoon Stress Test (14d)', style: TextStyle(color: Colors.white)),
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFFEF4444)),
                  ),
                  const SizedBox(width: 16),
                  IconButton(icon: const Icon(Icons.refresh, color: Color(0xFF64748B)), onPressed: () { setState(() => _loading = true); _fetchStats(); _fetchPredictions(); }),
                ]),
              ],
            ),
            const SizedBox(height: 32),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else
              Wrap(
                spacing: 20, runSpacing: 20,
                children: [
                  _StatCard(label: 'Active Pools', value: '${_stats?['active_pools'] ?? '--'}', icon: Icons.pool_rounded, color: const Color(0xFF6366F1)),
                  _StatCard(label: 'Riders Insured', value: '${_stats?['total_riders_insured'] ?? '--'}', icon: Icons.directions_bike_rounded, color: const Color(0xFF10B981)),
                  _StatCard(label: 'Total Payouts', value: '₹${_stats?['total_payouts_issued'] ?? '--'}', icon: Icons.payments_rounded, color: const Color(0xFFF59E0B)),
                  _StatCard(label: 'Total Collected', value: '₹${_stats?['total_collected'] ?? '--'}', icon: Icons.savings_rounded, color: const Color(0xFF10B981)),
                  _StatCard(label: 'City Reserve', value: '₹${_stats?['city_reserve_level'] ?? '--'}', icon: Icons.account_balance_rounded, color: const Color(0xFF3B82F6)),
                  _StatCard(
                    label: 'Global Loss Ratio (60-75%)',
                    value: _stats != null ? '${(((_stats!['global_loss_ratio'] ?? 0) as num) * 100).toStringAsFixed(1)}%' : '--',
                    icon: Icons.warning_amber_rounded,
                    color: const Color(0xFFF97316)
                  ),
                  _StatCard(
                    label: 'Global BCR (1.33-1.67x)',
                    value: _stats != null ? '${((_stats!['global_bcr'] ?? 0) as num).toStringAsFixed(2)}x' : '--',
                    icon: Icons.analytics_rounded, 
                    color: const Color(0xFF8B5CF6)
                  ),
                ],
              ),
            const SizedBox(height: 40),
            Text('Platform Status', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
            const SizedBox(height: 16),
            _StatusRow(label: 'Backend API', online: true),
            _StatusRow(label: 'AI / Fraud Service', online: true),
            _StatusRow(label: 'Firestore', online: true),
            const SizedBox(height: 40),
            Text('7-Day Risk Predictions', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
            const SizedBox(height: 16),
            if (_predictions == null)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: const Center(child: CircularProgressIndicator()),
              )
            else if (_predictions!.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: Center(child: Text('No predictions available', style: GoogleFonts.inter(color: const Color(0xFF94A3B8)))),
              )
            else
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF334155)),
                ),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: [
                      DataColumn(label: Text('Date', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600))),
                      DataColumn(label: Text('Risk Score', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600))),
                      DataColumn(label: Text('Predicted Claims', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600))),
                    ],
                    rows: (_predictions ?? []).map((p) {
                      final riskScore = (p['risk_score'] ?? 0) as num;
                      final riskColor = riskScore > 70 ? const Color(0xFFEF4444) : 
                                       riskScore > 40 ? const Color(0xFFF59E0B) : 
                                       const Color(0xFF10B981);
                      return DataRow(cells: [
                        DataCell(Text(p['date'] ?? '--', style: GoogleFonts.inter(color: Colors.white70))),
                        DataCell(Row(children: [
                          Container(
                            width: 8, height: 8,
                            decoration: BoxDecoration(color: riskColor, shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 8),
                          Text('${riskScore.toStringAsFixed(1)}%', style: GoogleFonts.inter(color: riskColor, fontWeight: FontWeight.w600)),
                        ])),
                        DataCell(Text('${p['predicted_claims'] ?? 0}', style: GoogleFonts.inter(color: Colors.white70))),
                      ]);
                    }).toList(),
                  ),
                ),
              ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color, size: 22),
        ),
        const SizedBox(height: 16),
        Text(value, style: GoogleFonts.inter(fontSize: 32, fontWeight: FontWeight.w700, color: Colors.white)),
        const SizedBox(height: 4),
        Text(label, style: GoogleFonts.inter(color: const Color(0xFF94A3B8), fontSize: 14)),
      ]),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String label;
  final bool online;
  const _StatusRow({required this.label, required this.online});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: online ? const Color(0xFF10B981) : const Color(0xFFEF4444), shape: BoxShape.circle)),
        const SizedBox(width: 12),
        Text(label, style: GoogleFonts.inter(color: Colors.white)),
        const Spacer(),
        Text(online ? 'Online' : 'Offline', style: GoogleFonts.inter(color: online ? const Color(0xFF10B981) : const Color(0xFFEF4444), fontSize: 13)),
      ]),
    );
  }
}
