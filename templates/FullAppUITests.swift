import XCTest

final class FullAppUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()

        // Dismiss system permission dialogs (location, notifications, etc.)
        addUIInterruptionMonitor(withDescription: "System dialog") { alert in
            for label in ["Allow", "Allow Once", "OK", "Continue"] {
                let btn = alert.buttons[label]
                if btn.exists { btn.tap(); return true }
            }
            return false
        }
    }

    func testAppLaunchesSuccessfully() {
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    func el(_ id: String) -> XCUIElement {
        // Search all descendants — covers React Native modals in separate UIWindows
        return app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    func tap(_ id: String, timeout: TimeInterval = 10) {
        let element = el(id)
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Element not found: \(id)")
        element.tap()
    }

    func typeText(_ id: String, text: String, timeout: TimeInterval = 10) {
        let element = el(id)
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Element not found: \(id)")
        element.tap()
        element.typeText(text)
    }

    func waitFor(_ id: String, timeout: TimeInterval = 10) -> Bool {
        return el(id).waitForExistence(timeout: timeout)
    }

    // Coverage stubs will be auto-appended below this line by ui_test_coverage.sh
}
