# -*- mode: ruby -*-
# vi: set ft=ruby

Vagrant.configure("2") do |config|

  # Default provider is virtualbox
  # if you want aws, you need to first populate
  # and then run e.g.
  # . aws.sh
    config.vm.box = "ubuntu/trusty64"
    config.vm.synced_folder ".", "/vagrant", :mount_options => ["dmode=777", "fmode=777"]

    config.vm.provider "virtualbox" do |vbox|
      config.ssh.forward_x11 = true

      # host-only network on which web browser serves files
      config.vm.network "private_network", ip: "192.168.56.101"

      vbox.cpus = 4
      vbox.memory = 30000
    end

    config.vm.provider "aws" do |aws, override|

      aws.tags["Name"] = "Eesen Transcriber"
      aws.ami = ENV["AWS_AMI"] 
      aws.instance_type = ENV["AWS_INSTANCE_TYPE"]
      
      # we need more disk
      aws.block_device_mapping = [{ 'DeviceName' => '/dev/sda1', 'Ebs.VolumeSize' => 50 }]

      override.vm.synced_folder ".", "/vagrant", type: "sshfs", ssh_username: ENV['USER'], ssh_port: "22", prompt_for_password: "true"

      override.vm.box = "https://github.com/mitchellh/vagrant-aws/raw/master/dummy.box"

      # it is assumed these environment variables were set by ". env.sh"
      aws.access_key_id = ENV['AWS_KEY']
      aws.secret_access_key = ENV['AWS_SECRETKEY']
      aws.keypair_name = ENV['AWS_KEYPAIR']
      override.ssh.username = "ubuntu"
      override.ssh.private_key_path = ENV['AWS_PEM']

      aws.terminate_on_shutdown = "true"
      aws.region = ENV['AWS_REGION']

      # https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#SecurityGroups
      # Edit the security group on AWS Console; Inbound tab, add the HTTP rule
      aws.security_groups = ENV['AWS_SECURITY_GROUP']

      #aws.subnet_id = "vpc-666c9a02"
      aws.region_config "us-east-1" do |region|
        #region.spot_instance = true
        region.spot_max_price = "0.1"
      end

      # this works around the error from AWS AMI vm on 'vagrant up':
      #   No host IP was given to the Vagrant core NFS helper. This is
      #   an internal error that should be reported as a bug.
      #override.nfs.functional = false
    end

  config.vm.provision "shell", inline: <<-SHELL

    if grep --quiet vagrant /etc/passwd
    then
      user="vagrant"
    else
      user="ubuntu"
    fi

    apt-get update -y
    apt-get upgrade -y

    apt-get install -y git make automake libtool autoconf patch subversion fuse\
       libatlas-base-dev libatlas-dev liblapack-dev sox openjdk-6-jre libav-tools g++\
       zlib1g-dev libsox-fmt-all apache2 sshfs nodejs

    # required to get drivers compatible with CUDA 7.5
    apt-get install -y linux-image-extra-`uname -r`

    # If you wish to train EESEN with a GPU machine, uncomment this section to install CUDA
    # also uncomment the line that mentions cudatk-dir in the EESEN install section below
    cd /home/${user}
    wget -nv http://speechkitchen.org/vms/Data/cuda-repo-ubuntu1404-7-5-local_7.5-18_amd64.deb
    dpkg -i cuda-repo-ubuntu1404-7-5-local_7.5-18_amd64.deb
    rm cuda-repo-ubuntu1404-7-5-local_7.5-18_amd64.deb
    apt-get update
    apt-get remove --purge xserver-xorg-video-nouveau
    apt-get install -y cuda

    # make space on cloud auto-mounted filesystem
    if [ ${user} == ubuntu ]
    then
      mkdir /mnt/eesen
      cd /home/${user}
      ln -s /mnt/eesen .

      ln -s /home/ubuntu /home/vagrant
      chown ubuntu:ubuntu /home/vagrant
    fi

    # install srvk EESEN (does not require CUDA)
    git clone https://github.com/srvk/eesen
    cd eesen
    git reset --hard bfa1520
    cd tools
    make -j `lscpu -p|grep -v "#"|wc -l`
    # remove a parameter from scoring script
    sed -i 's/\ lur//g' sctk/bin/hubscr.pl
    cd ../src
    ./configure --shared --cudatk-dir=/usr/local/cuda-7.5
    make -j `lscpu -p|grep -v "#"|wc -l`

    # install language model building toolkit
    cd /home/${user}/eesen/asr_egs/tedlium/v2-30ms
    git clone http://github.com/srvk/lm_build

    # get cantab-TEDLIUM language model
    if [ ! -f db/cantab-TEDLIUM/cantab-TEDLIUM-pruned.lm3.gz ]; then
      rm -rf db
      ln -s /vagrant/db .
      cd db
      if [ ! -f cantab-TEDLIUM ]; then
        wget --no-verbose --output-document=- http://cantabresearch.com/cantab-TEDLIUM.tar.bz2 | bzcat | tar --extract --no-same-owner --file=-
      fi
    fi

    # DO NOT GET - assume it's there! TEDLIUM_release1
    if [ ! -d /home/${user}/eesen/asr_egs/tedlium/v2-30ms/db/TEDLIUM_release1 ]; then
      echo "Missing TEDLIUM_release1 data set. Please download it from"
      echo "http://www.openslr.org/resources/7/TEDLIUM_release1.tar.gz"
      exit 1
    fi

    # get eesen-offline-transcriber
    mkdir -p /home/${user}/tools
    cd /home/${user}/tools
    git clone https://github.com/srvk/srvk-eesen-offline-transcriber
    mv srvk-eesen-offline-transcriber eesen-offline-transcriber
    # make links to EESEN
    cd eesen-offline-transcriber
    ln -s /home/${user}/eesen/asr_egs/tedlium/v2-30ms/steps .
    ln -s /home/${user}/eesen/asr_egs/tedlium/v2-30ms/utils .

    # get models
    cd /home/${user}/eesen/asr_egs/tedlium
    wget -nv http://speechkitchen.org/vms/Data/v2-30ms.tgz
    tar zxvf v2-30ms.tgz --dereference
    rm v2-30ms.tgz
    # optionally get 8khz models
    if [ -f /vagrant/swbd-v1-pitch.tgz ]
    then
       cd /home/${user}/eesen/asr_egs/swbd
       tar zxvf /vagrant/swbd-v1-pitch.tgz
    fi

    # Results (and intermediate files) are placed on the shared host folder
    mkdir -p /vagrant/{build,log,transcribe_me}

    ln -s /vagrant/build /home/${user}/tools/eesen-offline-transcriber/build

    # get XFCE, xterm if we want guest VM to open windows /menus on host
    # apt-get install -y xfce4-panel xterm

    # Apache setup
    # unzip web root template
    cd /vagrant
    git clone http://github.com/srvk/www

    # set the shared folder to be (mounted as a shared folder in the VM) "www"
    sed -i 's|/var/www/html|/vagrant/www|g' /etc/apache2/sites-enabled/000-default.conf
    sed -i 's|/var/www/|/vagrant/www/|g' /etc/apache2/apache2.conf
    service apache2 restart

    # shorten paths used by vagrant ssh -c <command> commands
    # by symlinking ~/bin to here
    ln -s /home/${user}/tools/eesen-offline-transcriber /home/${user}/bin

    # get SLURM stuff
    #apt-get install -y --no-install-recommends slurm-llnl < /usr/bin/yes
    #/usr/sbin/create-munge-key -f
    #mkdir -p /var/run/munge /var/run/slurm-llnl
    #chown munge:root /var/run/munge
    #chown slurm:slurm /var/run/slurm-llnl
    #echo 'OPTIONS="--syslog"' >> /etc/default/munge
    #cp /vagrant/conf/slurm.conf /etc/slurm-llnl/slurm.conf
    #cp /vagrant/conf/reconf-slurm.sh /root/
    # 
    # Supervisor stuff needed by slurm
    # copy config first so it gets picked up
    #cp /vagrant/conf/supervisor.conf /etc/supervisor.conf
    #mkdir -p /etc/supervisor/conf.d
    #cp /vagrant/conf/slurm.sv.conf /etc/supervisor/conf.d/
    # Now start service
    #apt-get install -y supervisor

    # Turn off release upgrade messages
    sed -i s/Prompt=lts/Prompt=never/ /etc/update-manager/release-upgrades
    rm -f /var/lib/ubuntu-release-upgrader/*
    /usr/lib/ubuntu-release-upgrader/release-upgrade-motd
    
    # Silence error message from missing file
    touch /home/${user}/.Xauthority 

    # bring in SToNE stuff
    cd /
    ln -s /vagrant/node .
    chown -R ${user}:${user} node

    cd /home/${user}/eesen/asr_egs/tedlium/v2-30ms
    cp /vagrant/{master_config.sh,master_reset.sh,master_script.sh,parse_options.sh} .
    cp /vagrant/decode_ctc_lat_model.sh steps/

    # Provisioning runs as root; we want files to belong to '${user}'
    chown -R ${user}:${user} /home/${user}

  SHELL
end

# always monitor watched folder
  Vagrant.configure("2") do |config|
  config.vm.provision "shell", run: "always", inline: <<-SHELL
    if grep --quiet vagrant /etc/passwd
    then
      user="vagrant"
    else
      user="ubuntu"
    fi
    rm -rf /var/run/motd.dynamic

    if [ ${user} == vagrant ] 
    then
      echo "Point your Chrome or Safari browser to http://192.168.56.101:3000 to visit SToNE"
    else
      publicIP=`curl -s http://169.254.169.254/latest/meta-data/public-ipv4`
      echo "Point your Chrome or Safari browser to http://${publicIP}:3000 to visit SToNE"

      # put the public IP in port.json as the URL for the webapp      
      sed s/X-X-X-X/${publicIP}/ /node/stone/port.json.in > /node/stone/port.json
      # Start node.js app running
      cd /node/stone
      su ${user} -c "nodejs app.js >& nodejs.log &"
    fi

    # monitor 'watched' folder for transcribe jobs
    #su ${user} -c "cd /home/${user}/tools/eesen-offline-transcriber && ./watch.sh >& /vagrant/log/watched.log &"
SHELL
end
