import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/auth_service.dart';
import 'dashboard_screen.dart';
import 'zones_screen.dart';
import 'claims_screen.dart';

class MainShell extends ConsumerStatefulWidget {
  const MainShell({super.key});
  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _selectedIndex = 0;

  final List<_ShellNavItem> _items = const [
    _ShellNavItem(
      label: 'Dashboard',
      icon: Icons.dashboard_rounded,
    ),
    _ShellNavItem(
      label: 'Zones',
      icon: Icons.map_rounded,
    ),
    _ShellNavItem(
      label: 'Claims',
      icon: Icons.receipt_long_rounded,
    ),
  ];

  Widget _buildSelectedPage() {
    switch (_selectedIndex) {
      case 0:
        return const DashboardScreen();
      case 1:
        return const ZonesScreen();
      case 2:
        return const ClaimsScreen();
      default:
        return const DashboardScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Row(
        children: [
          Container(
            width: 240,
            color: const Color(0xFF1E293B),
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFF6366F1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.shield_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'ShiftSure',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                for (var i = 0; i < _items.length; i++) ...[
                  _SidebarButton(
                    item: _items[i],
                    selected: _selectedIndex == i,
                    onTap: () => setState(() => _selectedIndex = i),
                  ),
                  const SizedBox(height: 8),
                ],
                const Spacer(),
                TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF94A3B8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 14,
                    ),
                    minimumSize: const Size(double.infinity, 0),
                    alignment: Alignment.centerLeft,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: const Icon(Icons.logout, size: 18),
                  label: Text(
                    'Sign out',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w500),
                  ),
                  onPressed: () => AuthService.signOut(),
                ),
              ],
            ),
          ),
          const VerticalDivider(
              width: 1, thickness: 1, color: Color(0xFF334155)),
          Expanded(
            child: KeyedSubtree(
              key: ValueKey(_selectedIndex),
              child: _buildSelectedPage(),
            ),
          ),
        ],
      ),
    );
  }
}

class _ShellNavItem {
  const _ShellNavItem({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;
}

class _SidebarButton extends StatelessWidget {
  const _SidebarButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _ShellNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final foregroundColor =
        selected ? const Color(0xFF6366F1) : const Color(0xFF94A3B8);

    return Material(
      color: selected
          ? const Color(0xFF6366F1).withValues(alpha: 0.12)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          child: Row(
            children: [
              Icon(item.icon, color: foregroundColor, size: 20),
              const SizedBox(width: 12),
              Text(
                item.label,
                style: GoogleFonts.inter(
                  color: foregroundColor,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
