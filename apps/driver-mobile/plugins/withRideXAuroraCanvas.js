const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const packageSource = `package com.ridex.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RideXCanvasPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = listOf(
        RideXAuroraCanvasManager()
    )
}
`;

const managerSource = `package com.ridex.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.view.View
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import kotlin.math.sin

class RideXAuroraCanvasManager : SimpleViewManager<RideXAuroraCanvasView>() {
    override fun getName(): String = "RideXAuroraCanvas"

    override fun createViewInstance(reactContext: ThemedReactContext): RideXAuroraCanvasView = RideXAuroraCanvasView(reactContext)

    @ReactProp(name = "intensity", defaultFloat = 1f)
    fun setIntensity(view: RideXAuroraCanvasView, value: Float) {
        view.intensity = value.coerceIn(0f, 2f)
    }

    @ReactProp(name = "drift", defaultFloat = 0f)
    fun setDrift(view: RideXAuroraCanvasView, value: Float) {
        view.drift = value.coerceIn(0f, 1f)
    }
}

class RideXAuroraCanvasView(context: ThemedReactContext) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private var phase = 0f
    var intensity: Float = 1f
        set(value) { field = value; invalidate() }
    var drift: Float = 0f
        set(value) { field = value; invalidate() }

    init {
        setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat().coerceAtLeast(1f)
        val h = height.toFloat().coerceAtLeast(1f)

        canvas.drawColor(Color.rgb(7, 15, 28))
        val gradient = LinearGradient(0f, 0f, w, h, intArrayOf(Color.rgb(15, 42, 63), Color.rgb(17, 65, 56), Color.rgb(34, 23, 61)), null, Shader.TileMode.CLAMP)
        paint.shader = gradient
        paint.style = Paint.Style.FILL
        canvas.drawRect(0f, 0f, w, h, paint)
        paint.shader = null

        drawWave(canvas, h * 0.62f, 30f, 0x3359C4FF.toInt())
        drawWave(canvas, h * 0.72f, 24f, 0x2A5EF0C1.toInt())
        drawWave(canvas, h * 0.80f, 18f, 0x25B06FFF.toInt())

        phase += 0.018f
        postInvalidateDelayed(32L)
    }

    private fun drawWave(canvas: Canvas, baseY: Float, amplitude: Float, color: Int) {
        val w = width.toFloat().coerceAtLeast(1f)
        val h = height.toFloat().coerceAtLeast(1f)
        path.reset()
        path.moveTo(0f, h)
        path.lineTo(0f, baseY)
        var x = 0f
        while (x <= w) {
            val y = baseY + sin((x / w) * Math.PI * 3.2 + phase + drift * 1.8).toFloat() * amplitude * intensity
            path.lineTo(x, y)
            x += 8f
        }
        path.lineTo(w, h)
        path.close()
        paint.color = color
        paint.style = Paint.Style.FILL
        canvas.drawPath(path, paint)
    }
}
`;

function writeFileIfChanged(filePath, source) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== source) {
    fs.writeFileSync(filePath, source, 'utf8');
  }
}

module.exports = function withRideXAuroraCanvas(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const androidRoot = config.modRequest.platformProjectRoot;
    const packageRoot = path.join(androidRoot, 'app', 'src', 'main', 'java', 'com', 'ridex', 'app');
    writeFileIfChanged(path.join(packageRoot, 'RideXCanvasPackage.kt'), packageSource);
    writeFileIfChanged(path.join(packageRoot, 'RideXAuroraCanvasManager.kt'), managerSource);

    const mainApplication = path.join(packageRoot, 'MainApplication.kt');
    if (fs.existsSync(mainApplication)) {
      let text = fs.readFileSync(mainApplication, 'utf8');
      if (!text.includes('import com.ridex.app.RideXCanvasPackage')) {
        text = text.replace(/^(package [^\n]+\n)/, `$1\nimport com.ridex.app.RideXCanvasPackage\n`);
      }
      const marker = 'return PackageList(this).packages.apply {';
      if (text.includes(marker) && !text.includes('add(RideXCanvasPackage())')) {
        text = text.replace(marker, `${marker}\n        add(RideXCanvasPackage())`);
      }
      fs.writeFileSync(mainApplication, text, 'utf8');
    }
    return config;
  }]);
};
