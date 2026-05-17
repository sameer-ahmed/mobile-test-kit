import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:your_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App smoke test', () {
    testWidgets('app launches successfully', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 3));
      // Verify the app rendered something
      expect(find.byType(Scaffold), findsWidgets);
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Coverage stubs will be auto-appended below this line by ui_test_coverage.sh
}
