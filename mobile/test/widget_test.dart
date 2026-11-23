
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('DataPilot app starts', (WidgetTester tester) async {
    await tester.pumpWidget(const DataPilotApp());

    expect(find.text('DataPilot'), findsOneWidget);
  });
}
