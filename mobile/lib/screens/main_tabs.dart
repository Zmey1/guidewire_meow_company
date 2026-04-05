import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import 'home/home_screen.dart';
import 'policy/policy_screen.dart';
import 'claims/claims_screen.dart';
import 'wallet/wallet_screen.dart';
import 'main_tab_controller.dart';

class MainTabs extends StatefulWidget {
  const MainTabs({super.key});
  @override
  State<MainTabs> createState() => _MainTabsState();
}

class _MainTabsState extends State<MainTabs> {
  @override
  void initState() {
    super.initState();
    mainTabIndex.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: mainTabIndex,
      builder: (context, index, _) => Scaffold(
        body: IndexedStack(
          index: index,
          children: const [HomeScreen(), PolicyScreen(), ClaimsScreen(), WalletScreen()],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => mainTabIndex.value = i,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_rounded), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.verified_user_rounded), selectedIcon: Icon(Icons.verified_user_rounded), label: 'Policy'),
            NavigationDestination(icon: Icon(Icons.receipt_long_rounded), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Claims'),
            NavigationDestination(icon: Icon(Icons.account_balance_wallet_rounded), selectedIcon: Icon(Icons.account_balance_wallet_rounded), label: 'Wallet'),
          ],
        ),
      ),
    );
  }
}
