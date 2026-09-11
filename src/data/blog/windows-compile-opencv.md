---
title: 'Windows 编译 OpenCV'
description: '课程需要在 Windows 下编译支持 OpenGL 的旧版 OpenCV（2.4.13.6 + VS2017），记录完整的 CMake 配置与编译流程。'
pubDatetime: 2018-11-24T21:29:17+08:00
featured: false
tags:
  - CMake
  - OpenCV
---

由于课程需要，要在 Windows 下编译一个支持 OpenGL 的 OpenCV 旧版本。
这里简单地做个总结，以便以后参阅。


### 0x0 准备工作

#### # **编译环境**

+ Windows 10 1809
+ CMake 3.13.0
+ OpenCV 2.4.13.6-vc14
+ Visual Stuido 2017

#### # **安装CMake**

首先需要安装 CMake，进入官网下载安装包，优先选择 [cmake-3.13.0-win64-x64.msi](https://github.com/Kitware/CMake/releases/download/v3.13.0/cmake-3.13.0-win64-x64.msi)，安装完成后可以在开始菜单中找到 `cmake-gui`。

#### # **下载 OpenCV 源代码**

进入 [OpenCV 的发布页面](https://opencv.org/releases.html) 下载 OpenCV 源码包，我下载的是 `2.4.13.6` 版本。
运行 `opencv-2.4.13.6-vc14.exe`，选择解压目录后解压，我选择解压到 `H:\`。
解压后文件目录如下：

```plaintext
H:\opencv
├── build
├── sources
├── LICENSE.txt
└── README.md.txt
```

为了方便区分，我们把目录改名 `opencv->opencv2413`
接下来打开 build 文件夹，发现无论是 `x86` 还是 `x64` 文件夹下都只有 `vc14` 版本的二进制、库文件等。

```plaintext
H:\opencv
├── build
|    ├── x86
|    |    └── vc14
|    └── x64
|        └── vc14
├── sources
├── LICENSE.txt
└── README.md.txt
```

而我们的 `Visual Studio 2017` 对应的版本号是 `vc15`，也就是官方并没有提供新版本的预编译库文件，所以我要自己动手编译了。这样一来可以把 OpenGL 编译进去，**首先清空 build 目录里的所有内容**，因为我们下一步要将编译后的文件放入 build 目录。

**Tips: VC1x 与 Visual Studio 版本号的对应关系**

| VC1x | Visual Studio 版本号 |
| - | - |
| vc15 | Visual Studio 2017 |
| vc14 | Visual Studio 2015 |
| vc12 | Visual Studio 2013 |
| vc11 | Visual Studio 2012 |
| vc10 | Visual Studio 2010 |

### 0x1 编译 OpenCV

#### # CMake-GUI 纪元

现在打开 `cmake-gui`

> Where is the source code: 

先选择待编译的源码目录，我选择的是 `H:\opencv2413\sources`

> Where to build the binaries:

然后选择编译完成后的生成目录，我选择的是 `H:\opencv2413\build`

接下来点击左下角的 `Configure` 按钮，弹出对话框选择 `Visual Studio 15 2017`，下面的选项默认，然后点击 `Finish`，等待出现 Configuring done。

![cmake-configure](https://i.loli.net/2018/11/24/5bf91600c83ad.png)

接下来找到 `WITH_OPENGL`，并且把它勾选上，这样 OpenCV 就有 OpenGL 加持了。

**再次点击 `Configure` 按钮，使之生效。**

具体可以查看输出信息，确实是支持 OpenGL 的。

```plaintext
...
GUI: 
  QT:                          NO
  Win32 UI:                    YES
  OpenGL support:              YES (opengl32 glu32)
  VTK support:                 NO
...
```

点击 `Generate` 后等待出现 Generating done，然后点击 `Open Project` 打开 Visual Studio 项目。

#### # Visual Studio 纪元

打开「解决方案资源管理器」，如果找不到可以在「视图(V)」中打开。

![solution](https://i.loli.net/2018/11/24/5bf91a4e5aac5.png)

**首先选择 `Release` 模式**，右键 `INSTALL` 选择生成，开始编译，编译的时间视机器的性能而定。

很长时间过去了...

最后，我们可以发现编译后的文件在 `H:\opencv2413\build\install` 文件夹里。

后续，大概还会尝试编译一些 OpenCV 相关的项目吧😋。

### 0x2 参考资料

+ [【OpenCV】VS2017配置OpenCV2.4.13.4](https://blog.csdn.net/Dango_miracle/article/details/78681131)

