import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import 'home/home_screen.dart';
import 'policy/policy_screen.dart';
import 'claims/claims_screen.dart';
import 'wallet/wallet_screen.dart';

class MainTabs extends StatefulWidget {
  const MainTabs({super.key});
  @override
  State<MainTabs> createState() => _MainTabsState();
}

class _MainTabsState extends State<MainTabs> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [HomeScreen(), PolicyScreen(), ClaimsScreen(), WalletScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_rounded), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.verified_user_rounded), selectedIcon: Icon(Icons.verified_user_rounded), label: 'Policy'),
          NavigationDestination(icon: Icon(Icons.receipt_long_rounded), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Claims'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_rounded), selectedIcon: Icon(Icons.account_balance_wallet_rounded), label: 'Wallet'),
        ],
      ),
    );
  }
}
