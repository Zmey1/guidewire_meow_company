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

  final List<NavigationRailDestination> _destinations = const [
    NavigationRailDestination(icon: Icon(Icons.dashboard_rounded), label: Text('Dashboard')),
    NavigationRailDestination(icon: Icon(Icons.map_rounded), label: Text('Zones')),
    NavigationRailDestination(icon: Icon(Icons.receipt_long_rounded), label: Text('Claims')),
  ];

  final List<Widget> _pages = const [
    DashboardScreen(),
    ZonesScreen(),
    ClaimsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Row(
        children: [
          NavigationRail(
            backgroundColor: const Color(0xFF1E293B),
            selectedIndex: _selectedIndex,
            onDestinationSelected: (i) => setState(() => _selectedIndex = i),
            extended: true,
            minExtendedWidth: 220,
            leading: Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
              child: Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)]),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.shield_rounded, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                Text('ShiftSure', style: GoogleFonts.inter(fontWeight: FontWeight.w700, color: Colors.white, fontSize: 16)),
              ]),
            ),
            trailing: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              child: SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  style: TextButton.styleFrom(
                    alignment: Alignment.centerLeft,
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  icon: const Icon(Icons.logout, color: Color(0xFF94A3B8), size: 18),
                  label: Text('Sign out', style: GoogleFonts.inter(color: const Color(0xFF94A3B8))),
                  onPressed: () => AuthService.signOut(),
                ),
              ),
            ),
            selectedIconTheme: const IconThemeData(color: Color(0xFF6366F1)),
            unselectedIconTheme: const IconThemeData(color: Color(0xFF64748B)),
            selectedLabelTextStyle: GoogleFonts.inter(color: const Color(0xFF6366F1), fontWeight: FontWeight.w600),
            unselectedLabelTextStyle: GoogleFonts.inter(color: const Color(0xFF64748B)),
            destinations: _destinations,
          ),
          const VerticalDivider(width: 1, thickness: 1, color: Color(0xFF334155)),
          Expanded(child: _pages[_selectedIndex]),
        ],
      ),
    );
  }
}
