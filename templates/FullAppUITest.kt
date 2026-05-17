package com.yourapp

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiScrollable
import androidx.test.uiautomator.UiSelector
import androidx.test.uiautomator.Until
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FullAppUITest {

    private lateinit var device: UiDevice
    private val TIMEOUT = 10_000L
    private val PACKAGE = InstrumentationRegistry.getInstrumentation()
        .targetContext.packageName

    @Before
    fun setUp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val intent = InstrumentationRegistry.getInstrumentation()
            .context.packageManager.getLaunchIntentForPackage(PACKAGE)!!
            .apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        InstrumentationRegistry.getInstrumentation().context.startActivity(intent)
        device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), TIMEOUT)
    }

    @Test
    fun appLaunchesSuccessfully() {
        assert(device.hasObject(By.pkg(PACKAGE))) { "App did not launch" }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun tap(testId: String) {
        val el = device.wait(Until.findObject(By.desc(testId)), TIMEOUT)
            ?: device.wait(Until.findObject(By.res(PACKAGE, testId)), TIMEOUT)
        checkNotNull(el) { "Element not found: $testId" }
        el.click()
        device.waitForIdle(500)
    }

    private fun type(testId: String, text: String) {
        tap(testId)
        InstrumentationRegistry.getInstrumentation().sendStringSync(text)
        device.pressBack()
    }

    private fun waitFor(testId: String, timeoutMs: Long = TIMEOUT): Boolean {
        return device.wait(Until.findObject(By.desc(testId)), timeoutMs) != null
                || device.wait(Until.findObject(By.res(PACKAGE, testId)), timeoutMs) != null
    }

    private fun scrollIntoView(testId: String) {
        UiScrollable(UiSelector().scrollable(true))
            .scrollIntoView(UiSelector().description(testId))
    }

    // Coverage stubs will be auto-appended below this line by ui_test_coverage.sh
}
